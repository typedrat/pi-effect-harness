import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActiveBranch } from '../../src/ActiveBranch.ts';
import { fromSessionStateStore } from '../../src/kernel/adapters/opencode/BranchSnapshot.ts';
import { SessionStateStore } from '../../src/session-state/SessionStateStore.ts';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe('opencode BranchSnapshot.fromSessionStateStore', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'oc-branch-snap-test-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	it('produces an empty branch for an unknown session', async () => {
		const branch = await Effect.runPromise(
			fromSessionStateStore('unknown').pipe(
				Effect.provide(
					SessionStateStore.layer(rootDir).pipe(
						Layer.provide(platformLayer)
					)
				)
			)
		);
		expect(branch.entries.length).toBe(0);
	});

	it('produces one CustomEntry per loaded skill, sorted', async () => {
		const branch = await Effect.runPromise(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('s1', 'effect-error-handling');
				yield* store.recordSkillLoad('s1', 'effect-layer-design');
				return yield* fromSessionStateStore('s1');
			}).pipe(
				Effect.provide(
					SessionStateStore.layer(rootDir).pipe(
						Layer.provide(platformLayer)
					)
				)
			)
		);
		expect(branch.entries.length).toBe(2);
		const customEntries = branch.entries.filter(
			(e): e is ActiveBranch.CustomEntry =>
				e instanceof ActiveBranch.CustomEntry
		);
		expect(customEntries.length).toBe(2);
		for (const entry of customEntries) {
			expect(entry.customType).toBe('pi-effect-harness:skill-loaded');
		}
		const names = customEntries
			.map((e) => (e.data as { name: string; }).name)
			.sort();
		expect(names).toEqual(['effect-error-handling', 'effect-layer-design']);
	});
});
