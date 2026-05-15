import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { HarnessRule } from 'pi-harness-kit/kernel/HarnessRule.ts';
import { KernelLayer } from 'pi-harness-kit/kernel/layers/KernelLayer.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { HookSet } from 'pi-harness-kit/kernel/services/HookSet.ts';
import { PatternCatalog } from 'pi-harness-kit/kernel/services/PatternCatalog.ts';
import { PatternMatcher } from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { RuleEngine } from 'pi-harness-kit/kernel/services/RuleEngine.ts';
import { RuleSet } from 'pi-harness-kit/kernel/services/RuleSet.ts';
import { WriteProjection } from 'pi-harness-kit/kernel/services/WriteProjection.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import { OpenCodeModePersistence } from 'pi-harness-kit/mode/opencode/ModePersistence.ts';
import { GitBranch } from 'pi-harness-kit/mode/pi/GitBranch.ts';
import { ModePersistence } from 'pi-harness-kit/mode/pi/ModePersistence.ts';
import { SessionStateStore } from 'pi-harness-kit/session-state/SessionStateStore.ts';

import { clearPendingSkillReadsHooks } from '../hooks/ClearPendingSkillReads.ts';
import { ensureReferenceCloneHooks } from '../hooks/EnsureReferenceClone.ts';
import { emitSkillLoadedEntryHook as ocEmitSkillLoadedEntryHook } from '../hooks/opencode/EmitSkillLoadedEntry.ts';
import { rebuildSkillCatalogHooks as ocRebuildSkillCatalogHooks } from '../hooks/opencode/RebuildSkillCatalog.ts';
import { trackSkillReadHook as ocTrackSkillReadHook } from '../hooks/opencode/TrackSkillRead.ts';
import { emitSkillLoadedEntryHook as piEmitSkillLoadedEntryHook } from '../hooks/pi/EmitSkillLoadedEntry.ts';
import { rebuildSkillCatalogHooks as piRebuildSkillCatalogHooks } from '../hooks/pi/RebuildSkillCatalog.ts';
import { trackSkillReadHook as piTrackSkillReadHook } from '../hooks/pi/TrackSkillRead.ts';
import { injectEffectPolicyHeaderRule } from '../rules/InjectEffectPolicyHeader.ts';
import { requireLoadedSkillsForEffectWritesRule } from '../rules/RequireLoadedSkillsForEffectWrites.ts';
import { sendPatternFeedbackAfterWriteRule } from '../rules/SendPatternFeedbackAfterWrite.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';
import { ReferenceClone } from '../services/ReferenceClone.ts';
import { SkillCatalog } from '../services/SkillCatalog.ts';

export namespace EffectHarnessLayer {
	export interface PiConfig {
		readonly patternsDir: string;
		readonly guidanceDir: string;
	}

	export interface OpenCodeConfig {
		readonly patternsDir: string;
		readonly guidanceDir: string;
		readonly skillsDir: string;
		readonly cacheRootDir: string;
	}

	const nodePlatformLayer = NodeChildProcessSpawner.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
		)
	);

	/**
	 * Build the layer for the Pi extension host.
	 *
	 * Mirrors the upstream EffectHarnessLayer.layer behavior. Uses Pi's
	 * branch-aware ModePersistence and Pi-coupled hooks.
	 */
	export const forPi = (config: PiConfig) => {
		const kernelLayer = KernelLayer.layer(config.patternsDir).pipe(
			Layer.provide(nodePlatformLayer)
		);

		const guidanceCatalogLayer = GuidanceCatalog.layer(
			config.guidanceDir
		).pipe(Layer.provide(nodePlatformLayer));

		const gitBranchLayer = GitBranch.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const modePersistenceLayer = ModePersistence.layer.pipe(
			Layer.provide(Layer.mergeAll(nodePlatformLayer, gitBranchLayer))
		);

		const skillCatalogLayer = SkillCatalog.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const baseLayer = Layer.mergeAll(
			kernelLayer,
			PendingSkillReads.layer,
			gitBranchLayer,
			guidanceCatalogLayer,
			modePersistenceLayer,
			ModeState.layer,
			ReferenceClone.layer,
			skillCatalogLayer
		);

		const effectRuleSetLayer = Layer.effect(
			RuleSet.Service,
			Effect.gen(function*() {
				const guidanceCatalog = yield* GuidanceCatalog.Service;
				const modeState = yield* ModeState.Service;
				const patternCatalog = yield* PatternCatalog.Service;
				const patternMatcher = yield* PatternMatcher.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const writeProjection = yield* WriteProjection.Service;

				const rules: ReadonlyArray<HarnessRule.Any> = [
					injectEffectPolicyHeaderRule({ guidanceCatalog }),
					requireLoadedSkillsForEffectWritesRule({
						guidanceCatalog,
						pendingSkillReads,
						writeProjection
					}),
					sendPatternFeedbackAfterWriteRule({
						guidanceCatalog,
						patternCatalog,
						patternMatcher,
						writeProjection
					})
				];

				return RuleSet.Service.of({
					all: Effect.gen(function*() {
						const enabled = yield* modeState.isEnabled;
						return enabled ? rules : [];
					})
				});
			})
		).pipe(Layer.provide(baseLayer));

		const effectHookSetLayer = HookSet.fromEffect(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const skillCatalog = yield* SkillCatalog.Service;

				const hooks: ReadonlyArray<HarnessHook.Any> = [
					...clearPendingSkillReadsHooks({ pendingSkillReads }),
					...piRebuildSkillCatalogHooks({ skillCatalog }),
					...ensureReferenceCloneHooks({
						modeState,
						referenceClone
					}),
					piTrackSkillReadHook({
						pendingSkillReads,
						skillCatalog
					}),
					piEmitSkillLoadedEntryHook({
						pendingSkillReads,
						skillCatalog
					})
				];
				return hooks;
			})
		).pipe(Layer.provide(baseLayer));

		const ruleEngineLayer = RuleEngine.layer.pipe(
			Layer.provideMerge(Layer.mergeAll(baseLayer, effectRuleSetLayer))
		);

		const harnessControllerLayer = HarnessController.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(
					baseLayer,
					effectHookSetLayer,
					ruleEngineLayer
				)
			)
		);

		return Layer.mergeAll(
			baseLayer,
			effectRuleSetLayer,
			effectHookSetLayer,
			ruleEngineLayer,
			harnessControllerLayer
		);
	};

	/**
	 * Build the layer for the OpenCode plugin host.
	 *
	 * Uses OpenCode-flavored ModePersistence (project-scoped, fixed cache dir),
	 * SessionStateStore for skill-load tracking, and the opencode/ hooks.
	 */
	export const forOpenCode = (config: OpenCodeConfig) => {
		const kernelLayer = KernelLayer.layer(config.patternsDir).pipe(
			Layer.provide(nodePlatformLayer)
		);

		const guidanceCatalogLayer = GuidanceCatalog.layer(
			config.guidanceDir
		).pipe(Layer.provide(nodePlatformLayer));

		const ocModePersistenceLayer = OpenCodeModePersistence.layer(
			config.cacheRootDir
		).pipe(Layer.provide(nodePlatformLayer));

		const sessionStateStoreLayer = SessionStateStore.layer(
			config.cacheRootDir
		).pipe(Layer.provide(nodePlatformLayer));

		const skillCatalogLayer = SkillCatalog.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const baseLayer = Layer.mergeAll(
			kernelLayer,
			PendingSkillReads.layer,
			guidanceCatalogLayer,
			ocModePersistenceLayer,
			ModeState.layer,
			ReferenceClone.layer,
			skillCatalogLayer,
			sessionStateStoreLayer
		);

		const effectRuleSetLayer = Layer.effect(
			RuleSet.Service,
			Effect.gen(function*() {
				const guidanceCatalog = yield* GuidanceCatalog.Service;
				const modeState = yield* ModeState.Service;
				const patternCatalog = yield* PatternCatalog.Service;
				const patternMatcher = yield* PatternMatcher.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const writeProjection = yield* WriteProjection.Service;

				const rules: ReadonlyArray<HarnessRule.Any> = [
					injectEffectPolicyHeaderRule({ guidanceCatalog }),
					requireLoadedSkillsForEffectWritesRule({
						guidanceCatalog,
						pendingSkillReads,
						writeProjection
					}),
					sendPatternFeedbackAfterWriteRule({
						guidanceCatalog,
						patternCatalog,
						patternMatcher,
						writeProjection
					})
				];

				return RuleSet.Service.of({
					all: Effect.gen(function*() {
						const enabled = yield* modeState.isEnabled;
						return enabled ? rules : [];
					})
				});
			})
		).pipe(Layer.provide(baseLayer));

		const effectHookSetLayer = HookSet.fromEffect(
			Effect.gen(function*() {
				const modeState = yield* ModeState.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const skillCatalog = yield* SkillCatalog.Service;

				const hooks: ReadonlyArray<HarnessHook.Any> = [
					...clearPendingSkillReadsHooks({ pendingSkillReads }),
					...ocRebuildSkillCatalogHooks({
						skillCatalog,
						skillsDir: config.skillsDir
					}),
					...ensureReferenceCloneHooks({
						modeState,
						referenceClone
					}),
					ocTrackSkillReadHook({
						pendingSkillReads,
						skillCatalog
					}),
					ocEmitSkillLoadedEntryHook({ pendingSkillReads })
				];
				return hooks;
			})
		).pipe(Layer.provide(baseLayer));

		const ruleEngineLayer = RuleEngine.layer.pipe(
			Layer.provideMerge(Layer.mergeAll(baseLayer, effectRuleSetLayer))
		);

		const harnessControllerLayer = HarnessController.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(
					baseLayer,
					effectHookSetLayer,
					ruleEngineLayer
				)
			)
		);

		return Layer.mergeAll(
			baseLayer,
			effectRuleSetLayer,
			effectHookSetLayer,
			ruleEngineLayer,
			harnessControllerLayer
		);
	};
}
