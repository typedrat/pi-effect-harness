import { Predicate, type Schema } from 'effect';

import { EditReplacement } from '../../../EditReplacement.ts';
import { WriteIntent } from '../../../WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

const recordFromUnknown = (
	value: unknown
): Readonly<Record<string | symbol, unknown>> | undefined =>
	Predicate.isReadonlyObject(value) ? value : undefined;

const stringField = (
	record: Readonly<Record<string | symbol, unknown>>,
	key: string
): string | undefined => {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
};

const writeIntentFrom = ({
	args,
	phase,
	toolName
}: {
	readonly args: unknown;
	readonly phase: 'tool_call' | 'tool_result';
	readonly toolName: 'edit' | 'write';
}): WriteIntentValue | undefined => {
	const record = recordFromUnknown(args);
	if (record === undefined) {
		return undefined;
	}

	const filePath = stringField(record, 'filePath') ??
		stringField(record, 'path');

	if (toolName === 'write') {
		const content = stringField(record, 'content');
		return content === undefined
			? undefined
			: new WriteIntent.WriteFile({
				phase,
				...(filePath !== undefined ? { filePath } : undefined),
				content
			});
	}

	// edit tool — try Pi-style { edits: [...] } first, then OpenCode-style.
	const edits = record.edits;
	if (Array.isArray(edits)) {
		const replacements = edits.flatMap((edit) => {
			const r = recordFromUnknown(edit);
			if (r === undefined) return [];
			const oldText = stringField(r, 'oldText') ??
				stringField(r, 'oldString');
			const newText = stringField(r, 'newText') ??
				stringField(r, 'newString');
			return oldText !== undefined && newText !== undefined
				? [new EditReplacement.Value({ oldText, newText })]
				: [];
		});
		return replacements.length === edits.length
			? new WriteIntent.EditFile({
				phase,
				...(filePath !== undefined ? { filePath } : undefined),
				replacements
			})
			: undefined;
	}

	const oldText = stringField(record, 'oldString') ??
		stringField(record, 'oldText');
	const newText = stringField(record, 'newString') ??
		stringField(record, 'newText');
	if (oldText === undefined || newText === undefined) {
		return undefined;
	}
	return new WriteIntent.EditFile({
		phase,
		...(filePath !== undefined ? { filePath } : undefined),
		replacements: [new EditReplacement.Value({ oldText, newText })]
	});
};

export const writeIntentFromToolExecuteBefore = (
	input: {
		readonly tool: string;
		readonly sessionID: string;
		readonly callID: string;
	},
	output: { readonly args: unknown; }
): WriteIntentValue | undefined =>
	input.tool === 'write' || input.tool === 'edit'
		? writeIntentFrom({
			args: output.args,
			phase: 'tool_call',
			toolName: input.tool
		})
		: undefined;

export const writeIntentFromToolExecuteAfter = (input: {
	readonly tool: string;
	readonly sessionID: string;
	readonly callID: string;
	readonly args: unknown;
}): WriteIntentValue | undefined =>
	input.tool === 'write' || input.tool === 'edit'
		? writeIntentFrom({
			args: input.args,
			phase: 'tool_result',
			toolName: input.tool
		})
		: undefined;
