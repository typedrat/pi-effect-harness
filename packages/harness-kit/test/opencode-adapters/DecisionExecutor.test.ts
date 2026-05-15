import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Decision } from '../../src/Decision.ts';
import {
	collectSystemPromptAdditions,
	executeSideEffects,
	findBlockReason
} from '../../src/kernel/adapters/opencode/DecisionExecutor.ts';
import { SessionStateStore } from '../../src/session-state/SessionStateStore.ts';
import { UserMessage } from '../../src/UserMessage.ts';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe('opencode DecisionExecutor', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'oc-decision-exec-test-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	describe('collectSystemPromptAdditions', () => {
		it('returns empty array when no InjectSystemPrompt decisions present', () => {
			expect(collectSystemPromptAdditions([])).toEqual([]);
		});

		it('extracts content in order, skipping non-InjectSystemPrompt decisions', () => {
			const decisions = [
				new Decision.InjectSystemPrompt({ content: 'first' }),
				new Decision.BlockToolCall({ reason: 'unrelated' }),
				new Decision.InjectSystemPrompt({ content: 'second' })
			];
			expect(collectSystemPromptAdditions(decisions)).toEqual([
				'first',
				'second'
			]);
		});
	});

	describe('findBlockReason', () => {
		it('returns undefined when no BlockToolCall present', () => {
			expect(findBlockReason([])).toBeUndefined();
		});

		it('returns the first BlockToolCall reason', () => {
			const decisions = [
				new Decision.InjectSystemPrompt({ content: 'x' }),
				new Decision.BlockToolCall({ reason: 'load skills first' })
			];
			expect(findBlockReason(decisions)).toBe('load skills first');
		});
	});

	describe('executeSideEffects', () => {
		it('records skill-loaded custom entries via SessionStateStore', async () => {
			const promptMock = vi.fn<(input: unknown) => Promise<void>>()
				.mockResolvedValue(
					undefined
				);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.AppendCustomEntry({
							customType: 'pi-effect-harness:skill-loaded',
							data: { name: 'effect-error-handling' }
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			const loaded = await Effect.runPromise(
				Effect.gen(function*() {
					const s = yield* SessionStateStore.Service;
					return yield* s.getLoadedSkills('session-A');
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);
			expect([...loaded]).toEqual(['effect-error-handling']);
			expect(promptMock).not.toHaveBeenCalled();
		});

		it('ignores AppendCustomEntry with non-skill-loaded customType', async () => {
			const promptMock = vi.fn<(input: unknown) => Promise<void>>()
				.mockResolvedValue(
					undefined
				);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.AppendCustomEntry({
							customType: 'some-other-type',
							data: { name: 'whatever' }
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			const loaded = await Effect.runPromise(
				Effect.gen(function*() {
					const s = yield* SessionStateStore.Service;
					return yield* s.getLoadedSkills('session-A');
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);
			expect(loaded.size).toBe(0);
		});

		it('delivers InjectUserMessage via client.session.prompt', async () => {
			const promptMock = vi.fn<(input: unknown) => Promise<void>>()
				.mockResolvedValue(
					undefined
				);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.InjectUserMessage({
							message: new UserMessage.Value({ content: 'hello' })
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			expect(promptMock).toHaveBeenCalledTimes(1);
			expect(promptMock.mock.calls[0]?.[0]).toMatchObject({
				path: { id: 'session-A' },
				body: { parts: [{ type: 'text', text: 'hello' }] }
			});
		});
	});
});
