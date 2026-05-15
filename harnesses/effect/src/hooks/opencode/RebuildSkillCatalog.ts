import { Effect } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { SkillCatalog } from '../../services/SkillCatalog.ts';

const noDecisions = [] as const;

const rebuild = (
	skillCatalog: SkillCatalog.Interface,
	skillsDir: string
) => Effect.as(
	skillCatalog.rebuildFromDirectory(skillsDir),
	noDecisions
);

export const rebuildSkillCatalogHooks = (deps: {
	readonly skillCatalog: SkillCatalog.Interface;
	readonly skillsDir: string;
}): ReadonlyArray<HarnessHook.Any> => [
	{
		id: 'effect.opencode.rebuild-skill-catalog.session-start',
		phase: 'sessionStart',
		run: () => rebuild(deps.skillCatalog, deps.skillsDir)
	},
	{
		id: 'effect.opencode.rebuild-skill-catalog.session-tree',
		phase: 'sessionTree',
		run: () => rebuild(deps.skillCatalog, deps.skillsDir)
	}
];
