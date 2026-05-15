import type { Plugin } from '@opencode-ai/plugin';
import { Effect, ManagedRuntime } from 'effect';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeBranchForSession } from 'pi-harness-kit/kernel/adapters/opencode/BeforeAgentStartSnapshot.ts';
import {
	collectSystemPromptAdditions,
	executeSideEffects,
	findBlockReason
} from 'pi-harness-kit/kernel/adapters/opencode/DecisionExecutor.ts';
import {
	writeIntentFromToolExecuteAfter,
	writeIntentFromToolExecuteBefore
} from 'pi-harness-kit/kernel/adapters/opencode/ToolEventSnapshot.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import { OpenCodeModePersistence } from 'pi-harness-kit/mode/opencode/ModePersistence.ts';
import { SessionStateStore } from 'pi-harness-kit/session-state/SessionStateStore.ts';

import { EffectHarnessLayer } from 'pi-effect-harness/layers/EffectHarnessLayer.ts';

const pluginRoot = dirname(fileURLToPath(import.meta.url));
// In the source tree, plugin.ts is at /opencode/plugin.ts.
// The shared content (patterns, guidance, skills) lives at
// /harnesses/effect/{patterns,guidance,skills}/.
// In the published tarball, the layout collapses to /dist/plugin.js with
// /skills, /patterns, /guidance, /commands at the root. The build script
// places these paths so that one ../<dir> walk from the plugin's own
// location reaches them in both layouts.
const patternsDir = join(pluginRoot, '..', 'harnesses', 'effect', 'patterns');
const guidanceDir = join(pluginRoot, '..', 'harnesses', 'effect', 'guidance');
const skillsDir = join(pluginRoot, '..', 'harnesses', 'effect', 'skills');

const cacheRootDir = join(homedir(), '.cache', 'opencode-effect-harness');

const TOGGLE_COMMAND_NAME = 'toggle-effect-harness';

const effectHarnessPlugin: Plugin = async (
	{ client, project, directory, worktree }
) => {
	const runtime = ManagedRuntime.make(
		EffectHarnessLayer.forOpenCode({
			patternsDir,
			guidanceDir,
			skillsDir,
			cacheRootDir
		})
	);
	type RuntimeServices = ManagedRuntime.ManagedRuntime.Services<
		typeof runtime
	>;
	const run = <A, E, R extends RuntimeServices>(
		effect: Effect.Effect<A, E, R>
	) => runtime.runPromise(effect);

	const projectId = project.id;
	const cwd = worktree ?? directory ?? process.cwd();

	// Restore mode state on startup. Default: enabled.
	const restored = await run(
		Effect.gen(function*() {
			const p = yield* OpenCodeModePersistence.Service;
			return yield* p.load(projectId);
		})
	);
	const initialEnabled = restored ?? true;
	await run(
		Effect.gen(function*() {
			const s = yield* ModeState.Service;
			yield* s.setEnabled(initialEnabled);
		})
	);

	const isEnabledRead = Effect.gen(function*() {
		const s = yield* ModeState.Service;
		return yield* s.isEnabled;
	});

	return {
		config: async (input) => {
			const cfg = input as typeof input & {
				skills?: { paths?: string[]; urls?: string[]; };
			};
			cfg.skills ??= {};
			cfg.skills.paths ??= [];
			if (!cfg.skills.paths.includes(skillsDir)) {
				cfg.skills.paths.push(skillsDir);
			}
		},

		'experimental.chat.system.transform': async (input, output) => {
			const enabled = await run(isEnabledRead);
			if (!enabled) {
				return;
			}
			const sessionId = input.sessionID ?? 'unknown';
			const decisions = await run(
				Effect.gen(function*() {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(
						sessionId
					);
					return yield* controller.onBeforeAgentStart({
						activeBranch,
						cwd
					});
				})
			);
			for (const addition of collectSystemPromptAdditions(decisions)) {
				output.system.push(addition);
			}
		},

		'tool.execute.before': async (input, output) => {
			const enabled = await run(isEnabledRead);
			if (!enabled) {
				return;
			}

			const writeIntent = writeIntentFromToolExecuteBefore(input, output);

			const decisions = await run(
				Effect.gen(function*() {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(
						input.sessionID
					);
					return yield* controller.onToolCall({
						activeBranch,
						cwd,
						input: output.args,
						toolCallId: input.callID,
						toolName: input.tool,
						writeIntent
					});
				})
			);

			const blockReason = findBlockReason(decisions);
			if (blockReason !== undefined) {
				throw new Error(blockReason);
			}
		},

		'tool.execute.after': async (input, _output) => {
			const enabled = await run(isEnabledRead);
			if (!enabled) {
				return;
			}

			const writeIntent = writeIntentFromToolExecuteAfter(input);

			const decisions = await run(
				Effect.gen(function*() {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(
						input.sessionID
					);
					return yield* controller.onToolResult({
						activeBranch,
						cwd,
						input: input.args,
						isError: false,
						toolCallId: input.callID,
						toolName: input.tool,
						writeIntent
					});
				})
			);

			await run(
				executeSideEffects({
					client,
					sessionId: input.sessionID,
					decisions
				})
			);
		},

		'command.execute.before': async (input, _output) => {
			if (input.command !== TOGGLE_COMMAND_NAME) {
				return;
			}

			const next = await run(
				Effect.gen(function*() {
					const state = yield* ModeState.Service;
					const persistence = yield* OpenCodeModePersistence.Service;
					const wasEnabled = yield* state.isEnabled;
					const nowEnabled = !wasEnabled;
					yield* state.setEnabled(nowEnabled);
					yield* persistence.save(projectId, nowEnabled);
					return nowEnabled;
				})
			);

			// Best-effort toast via the typed TUI publish endpoint.
			try {
				await client.tui.publish({
					body: {
						type: 'tui.toast.show',
						properties: {
							message: next
								? 'Effect harness mode enabled'
								: 'Effect harness mode disabled',
							variant: 'info'
						}
					}
				});
			} catch {
				// Swallow — toast is best-effort UX, not load-bearing.
			}

			throw new Error(
				'Command handled by opencode-effect-harness plugin'
			);
		},

		event: async ({ event }) => {
			if (event.type === 'session.created') {
				await run(
					Effect.gen(function*() {
						const controller = yield* HarnessController.Service;
						return yield* controller.onSessionStart({
							commands: [],
							cwd
						});
					})
				);
				return;
			}
			if (event.type === 'session.compacted') {
				const sessionId = event.properties.sessionID;
				await run(
					Effect.gen(function*() {
						const store = yield* SessionStateStore.Service;
						return yield* store.clearSession(sessionId);
					})
				);
				return;
			}
		}
	};
};

export default effectHarnessPlugin;
