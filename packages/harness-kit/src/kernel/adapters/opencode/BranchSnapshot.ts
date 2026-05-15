import { Effect } from 'effect';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';

const SKILL_LOADED_ENTRY = 'pi-effect-harness:skill-loaded';

/**
 * Build an ActiveBranch.Value from the SessionStateStore.
 *
 * The synthetic CustomEntry records use the same customType the Pi adapter
 * writes to session-branch metadata via `appendEntry`, so the downstream
 * `activeBranchLoadedEffectSkills` atom (in harnesses/effect/src/atoms/) reads
 * skill-loaded state identically regardless of which adapter populated it.
 *
 * If you change SKILL_LOADED_ENTRY here, also update
 * harnesses/effect/src/constants.ts to match.
 */
export const fromSessionStateStore = (
	sessionId: string
): Effect.Effect<ActiveBranch.Value, never, SessionStateStore.Service> =>
	Effect.gen(function*() {
		const store = yield* SessionStateStore.Service;
		const loaded = yield* store.getLoadedSkills(sessionId);
		const sorted = [...loaded].sort();
		const entries = sorted.map(
			(name, index) =>
				new ActiveBranch.CustomEntry({
					id: `synthetic:skill-loaded:${index}`,
					customType: SKILL_LOADED_ENTRY,
					data: { name }
				})
		);
		return new ActiveBranch.Value({ entries });
	});
