import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionStateStore } from '../src/session-state/SessionStateStore.ts';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe('SessionStateStore', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'session-state-test-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	const runWith = <A, E>(
		effect: Effect.Effect<A, E, SessionStateStore.Service>
	) => Effect.runPromise(
		effect.pipe(
			Effect.provide(
				SessionStateStore.layer(rootDir).pipe(
					Layer.provide(platformLayer)
				)
			)
		)
	);

	it('returns empty set for unknown session', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect(result.size).toBe(0);
	});

	it('records and reads back a skill load', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad(
					'session-A',
					'effect-error-handling'
				);
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect([...result].sort()).toEqual(['effect-error-handling']);
	});

	it('deduplicates repeated records', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad(
					'session-A',
					'effect-error-handling'
				);
				yield* store.recordSkillLoad(
					'session-A',
					'effect-error-handling'
				);
				yield* store.recordSkillLoad(
					'session-A',
					'effect-layer-design'
				);
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect([...result].sort()).toEqual([
			'effect-error-handling',
			'effect-layer-design'
		]);
	});

	it('isolates sessions', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad(
					'session-A',
					'effect-error-handling'
				);
				yield* store.recordSkillLoad(
					'session-B',
					'effect-layer-design'
				);
				return {
					a: yield* store.getLoadedSkills('session-A'),
					b: yield* store.getLoadedSkills('session-B')
				};
			})
		);
		expect([...result.a].sort()).toEqual(['effect-error-handling']);
		expect([...result.b].sort()).toEqual(['effect-layer-design']);
	});

	it('clearSession removes loaded skills', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad(
					'session-A',
					'effect-error-handling'
				);
				yield* store.clearSession('session-A');
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect(result.size).toBe(0);
	});
});
