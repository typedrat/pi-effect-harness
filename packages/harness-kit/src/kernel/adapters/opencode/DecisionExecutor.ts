import type { createOpencodeClient } from '@opencode-ai/sdk';
import { Effect, Schema } from 'effect';

import { Decision } from '../../../Decision.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';

class InjectUserMessageFailed
	extends Schema.TaggedErrorClass<InjectUserMessageFailed>()(
		'InjectUserMessageFailed',
		{
			cause: Schema.Unknown
		}
	) {}

type DecisionValue = Schema.Schema.Type<typeof Decision.Value>;
type OpencodeClient = ReturnType<typeof createOpencodeClient>;

const SKILL_LOADED_ENTRY = 'pi-effect-harness:skill-loaded';

/**
 * Pull all InjectSystemPrompt content strings out of a decision array, in the
 * order they appear. The plugin's experimental.chat.system.transform hook
 * pushes them onto output.system.
 */
export const collectSystemPromptAdditions = (
	decisions: ReadonlyArray<DecisionValue>
): ReadonlyArray<string> =>
	decisions
		.filter(
			(d): d is Decision.InjectSystemPrompt =>
				d instanceof Decision.InjectSystemPrompt
		)
		.map((d) => d.content);

/**
 * Find the first BlockToolCall reason in a decision array, or undefined if none.
 * The plugin's tool.execute.before hook throws on a defined reason to block.
 */
export const findBlockReason = (
	decisions: ReadonlyArray<DecisionValue>
): string | undefined => {
	const blocking = decisions.find(
		(d): d is Decision.BlockToolCall => d instanceof Decision.BlockToolCall
	);
	return blocking?.reason;
};

const dataAsRecord = (
	value: unknown
): Readonly<Record<string, unknown>> | undefined =>
	typeof value === 'object' && value !== null
		? (value as Readonly<Record<string, unknown>>)
		: undefined;

const skillNameFromCustomData = (data: unknown): string | undefined => {
	const record = dataAsRecord(data);
	if (record === undefined) return undefined;
	const name = record.name;
	return typeof name === 'string' && name.startsWith('effect-')
		? name
		: undefined;
};

/**
 * Execute side-effecting decisions:
 * - AppendCustomEntry (only the skill-loaded customType) → SessionStateStore
 * - InjectUserMessage → client.session.prompt
 *
 * System-prompt and block decisions are handled by the caller via the
 * helpers above; this function ignores them.
 */
export const executeSideEffects = ({
	client,
	sessionId,
	decisions
}: {
	readonly client: OpencodeClient;
	readonly sessionId: string;
	readonly decisions: ReadonlyArray<DecisionValue>;
}): Effect.Effect<void, never, SessionStateStore.Service> =>
	Effect.gen(function*() {
		const store = yield* SessionStateStore.Service;

		for (const decision of decisions) {
			if (decision instanceof Decision.AppendCustomEntry) {
				if (decision.customType === SKILL_LOADED_ENTRY) {
					const name = skillNameFromCustomData(decision.data);
					if (name !== undefined) {
						yield* store.recordSkillLoad(sessionId, name);
					}
				}
				continue;
			}

			if (decision instanceof Decision.InjectUserMessage) {
				yield* Effect.tryPromise({
					try: () =>
						client.session.prompt({
							path: { id: sessionId },
							body: {
								parts: [
									{
										type: 'text',
										text: decision.message.content
									}
								]
							}
						}),
					catch: (cause) => new InjectUserMessageFailed({ cause })
				}).pipe(Effect.orElseSucceed(() => undefined));
			}
		}
	});
