import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OpenCodeModePersistence } from '../../../src/mode/opencode/ModePersistence.ts';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe('OpenCodeModePersistence', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'oc-mode-persistence-test-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	const runWith = <A, E>(
		effect: Effect.Effect<A, E, OpenCodeModePersistence.Service>
	) => Effect.runPromise(
		effect.pipe(
			Effect.provide(
				OpenCodeModePersistence.layer(rootDir).pipe(
					Layer.provide(platformLayer)
				)
			)
		)
	);

	it('load returns undefined when no file exists', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const p = yield* OpenCodeModePersistence.Service;
				return yield* p.load('project-xyz');
			})
		);
		expect(result).toBeUndefined();
	});

	it('save then load round-trips true', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const p = yield* OpenCodeModePersistence.Service;
				yield* p.save('project-xyz', true);
				return yield* p.load('project-xyz');
			})
		);
		expect(result).toBe(true);
	});

	it('save then load round-trips false', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const p = yield* OpenCodeModePersistence.Service;
				yield* p.save('project-xyz', false);
				return yield* p.load('project-xyz');
			})
		);
		expect(result).toBe(false);
	});

	it('isolates projects', async () => {
		const result = await runWith(
			Effect.gen(function*() {
				const p = yield* OpenCodeModePersistence.Service;
				yield* p.save('project-A', true);
				yield* p.save('project-B', false);
				return {
					a: yield* p.load('project-A'),
					b: yield* p.load('project-B')
				};
			})
		);
		expect(result).toEqual({ a: true, b: false });
	});
});
