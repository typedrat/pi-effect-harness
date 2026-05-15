import type { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import {
	writeIntentFromToolExecuteAfter,
	writeIntentFromToolExecuteBefore
} from '../../src/kernel/adapters/opencode/ToolEventSnapshot.ts';
import { WriteIntent } from '../../src/WriteIntent.ts';

type WriteIntentValue = Schema.Schema.Type<typeof WriteIntent.Value>;

const assertWriteFile = (
	intent: WriteIntentValue | undefined
): WriteIntent.WriteFile => {
	if (!(intent instanceof WriteIntent.WriteFile)) {
		throw new Error(`expected WriteFile intent, got ${String(intent)}`);
	}
	return intent;
};

const assertEditFile = (
	intent: WriteIntentValue | undefined
): WriteIntent.EditFile => {
	if (!(intent instanceof WriteIntent.EditFile)) {
		throw new Error(`expected EditFile intent, got ${String(intent)}`);
	}
	return intent;
};

describe('opencode ToolEventSnapshot', () => {
	describe('writeIntentFromToolExecuteBefore', () => {
		it('returns undefined for non-write/edit tools', () => {
			expect(
				writeIntentFromToolExecuteBefore(
					{ tool: 'bash', sessionID: 's', callID: 'c' },
					{ args: { command: 'echo hi' } }
				)
			).toBeUndefined();
		});

		it('builds a WriteFile intent from write tool args', () => {
			const intent = assertWriteFile(
				writeIntentFromToolExecuteBefore(
					{ tool: 'write', sessionID: 's', callID: 'c' },
					{ args: { filePath: '/a/b.ts', content: 'hello' } }
				)
			);
			expect(intent.phase).toBe('tool_call');
			expect(intent.filePath).toBe('/a/b.ts');
			expect(intent.content).toBe('hello');
		});

		it('builds an EditFile intent from OpenCode-style edit args', () => {
			const intent = assertEditFile(
				writeIntentFromToolExecuteBefore(
					{ tool: 'edit', sessionID: 's', callID: 'c' },
					{
						args: {
							filePath: '/a/b.ts',
							oldString: 'foo',
							newString: 'bar',
							replaceAll: false
						}
					}
				)
			);
			expect(intent.phase).toBe('tool_call');
			expect(intent.replacements.length).toBe(1);
			const [first] = intent.replacements;
			expect(first?.oldText).toBe('foo');
			expect(first?.newText).toBe('bar');
		});

		it('builds an EditFile intent from Pi-style edits array', () => {
			const intent = assertEditFile(
				writeIntentFromToolExecuteBefore(
					{ tool: 'edit', sessionID: 's', callID: 'c' },
					{
						args: {
							filePath: '/a/b.ts',
							edits: [
								{ oldText: 'foo', newText: 'bar' },
								{ oldText: 'baz', newText: 'qux' }
							]
						}
					}
				)
			);
			expect(intent.replacements.length).toBe(2);
		});

		it('returns undefined for write args missing content', () => {
			expect(
				writeIntentFromToolExecuteBefore(
					{ tool: 'write', sessionID: 's', callID: 'c' },
					{ args: { filePath: '/a/b.ts' } }
				)
			).toBeUndefined();
		});
	});

	describe('writeIntentFromToolExecuteAfter', () => {
		it('sets phase=tool_result', () => {
			const intent = assertWriteFile(
				writeIntentFromToolExecuteAfter({
					tool: 'write',
					sessionID: 's',
					callID: 'c',
					args: { filePath: '/a/b.ts', content: 'hello' }
				})
			);
			expect(intent.phase).toBe('tool_result');
		});
	});
});
