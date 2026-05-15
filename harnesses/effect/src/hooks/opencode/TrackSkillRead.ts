import { Effect, Option, Predicate } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { PendingSkillReads } from '../../services/PendingSkillReads.ts';
import type { SkillCatalog } from '../../services/SkillCatalog.ts';

const noDecisions = [] as const;

const stringField = (
	record: Readonly<Record<string | symbol, unknown>>,
	key: string
): string | undefined => {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
};

const readPathFromInput = (input: unknown): string | undefined => {
	if (!Predicate.isReadonlyObject(input)) {
		return undefined;
	}
	return stringField(input, 'filePath') ?? stringField(input, 'path');
};

const skillNameFromInput = (input: unknown): string | undefined => {
	if (!Predicate.isReadonlyObject(input)) {
		return undefined;
	}
	const name = stringField(input, 'name');
	return name !== undefined && name.startsWith('effect-')
		? name
		: undefined;
};

export const trackSkillReadHook = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
	readonly skillCatalog: SkillCatalog.Interface;
}): HarnessHook.OnToolCall => ({
	id: 'effect.opencode.track-skill-read.tool-call',
	phase: 'toolCall',
	run: (input) =>
		Effect.gen(function*() {
			// Path A: the `skill` tool was invoked. The name comes from args.
			if (input.toolName === 'skill') {
				const name = skillNameFromInput(input.input);
				if (name !== undefined) {
					yield* deps.pendingSkillReads.remember(
						input.toolCallId,
						name
					);
				}
				return noDecisions;
			}

			// Path B: the `read` tool was invoked. Resolve the path against the
			// skill catalog.
			if (input.toolName !== 'read') {
				return noDecisions;
			}

			const readPath = readPathFromInput(input.input);
			if (readPath === undefined) {
				return noDecisions;
			}
			const normalizedPath = yield* deps.skillCatalog.normalizePath(
				readPath,
				input.cwd
			);
			const matchedSkill = yield* deps.skillCatalog.matchPath(
				normalizedPath
			);
			if (Option.isSome(matchedSkill)) {
				yield* deps.pendingSkillReads.remember(
					input.toolCallId,
					matchedSkill.value.name
				);
			}
			return noDecisions;
		})
});
