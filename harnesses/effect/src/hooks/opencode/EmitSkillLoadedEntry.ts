import { Effect } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import { activeBranchLoadedEffectSkills } from '../../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { SKILL_LOADED_ENTRY } from '../../constants.ts';
import type { PendingSkillReads } from '../../services/PendingSkillReads.ts';

const noDecisions = [] as const;

export const emitSkillLoadedEntryHook = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
}): HarnessHook.OnToolResult => ({
	id: 'effect.opencode.emit-skill-loaded-entry.tool-result',
	phase: 'toolResult',
	run: (input) =>
		Effect.gen(function*() {
			const pendingSkill = yield* deps.pendingSkillReads.take(
				input.toolCallId
			);
			if (pendingSkill === undefined || input.isError) {
				return noDecisions;
			}
			if (
				activeBranchLoadedEffectSkills(input.activeBranch).has(
					pendingSkill
				)
			) {
				return noDecisions;
			}
			return [
				new Decision.AppendCustomEntry({
					customType: SKILL_LOADED_ENTRY,
					data: { name: pendingSkill }
				})
			];
		})
});
