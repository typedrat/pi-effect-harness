#!/usr/bin/env bun
/**
 * Build a publishable copy of `opencode-effect-harness`.
 *
 * The OpenCode harness is structurally different from the Pi harness: it
 * bundles a single `plugin.js` entrypoint via `bun build`, inlining the
 * workspace-only `pi-harness-kit` and `pi-effect-harness` dependencies, and
 * ships the static skill / pattern / guidance content alongside it.
 *
 * Layout of the produced `harnesses/opencode-effect/dist/`:
 *
 *   opencode/plugin.js        — bundled entrypoint
 *   opencode/plugin.js.map    — external source map
 *   harnesses/effect/skills/  — copied verbatim
 *   harnesses/effect/patterns/
 *   harnesses/effect/guidance/
 *   README.md
 *   LICENSE
 *   package.json              — workspace deps removed, catalog resolved
 *
 * The `opencode/plugin.js` + `harnesses/effect/<content>` nesting mirrors
 * the dev tree layout (`/opencode/plugin.ts` + `/harnesses/effect/<dir>/`)
 * exactly, so the plugin's `join(pluginRoot, '..', 'harnesses', 'effect',
 * '<dir>')` path math resolves identically in both contexts. (This diverges
 * from the plan's flat `dist/plugin.js` + `dist/<dir>/` layout, which would
 * have made the `..` walk land outside the installed package.)
 *
 * Run from the workspace root:
 *
 *   bun run build:publishable:opencode
 */

import { $ } from 'bun';
import {
	cpSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'harnesses', 'opencode-effect', 'dist');
const HARNESS = join(ROOT, 'harnesses', 'effect');
const OPENCODE_DIR = join(ROOT, 'opencode');
const OC_HARNESS_DIR = join(ROOT, 'harnesses', 'opencode-effect');

interface WorkspacePackageJson {
	catalog: Record<string, string>;
}

interface OpenCodePackageJson {
	version: string;
}

interface KernelPackageJson {
	dependencies: Record<string, string>;
}

const rootPkg = JSON.parse(
	readFileSync(join(ROOT, 'package.json'), 'utf8')
) as WorkspacePackageJson;

const ocPkg = JSON.parse(
	readFileSync(join(OC_HARNESS_DIR, 'package.json'), 'utf8')
) as OpenCodePackageJson;

const kernelPkg = JSON.parse(
	readFileSync(join(ROOT, 'packages', 'harness-kit', 'package.json'), 'utf8')
) as KernelPackageJson;

const CATALOG_PROTOCOL = 'catalog:';
const resolveCatalog = (range: string, name: string): string => {
	if (range !== CATALOG_PROTOCOL) return range;
	const resolved = rootPkg.catalog[name];
	if (resolved === undefined) {
		throw new Error(
			`dependency '${name}' uses 'catalog:' but no entry exists in workspace catalog`
		);
	}
	return resolved;
};

console.log('[build-publishable-opencode] cleaning dist/');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(join(DIST, 'opencode'), { recursive: true });

// Externalize runtime npm deps. The workspace-only deps (pi-harness-kit,
// pi-effect-harness) are intentionally NOT externalized so bun inlines
// their sources into the bundle. @ast-grep/napi is externalized so the
// consumer's package manager fetches the correct platform-specific
// native binary instead of us shipping our build host's binary.
console.log('[build-publishable-opencode] bundling plugin entrypoint');
await $`bun build ${
	join(OPENCODE_DIR, 'plugin.ts')
} --target=bun --format=esm --sourcemap=external --outdir=${
	join(DIST, 'opencode')
} --external=effect --external=@effect/platform-node --external=@opencode-ai/plugin --external=@opencode-ai/sdk --external=@ast-grep/napi --external=picomatch --external=yaml`
	.quiet();

console.log('[build-publishable-opencode] copying static content');
const harnessDistDir = join(DIST, 'harnesses', 'effect');
mkdirSync(harnessDistDir, { recursive: true });
cpSync(join(HARNESS, 'skills'), join(harnessDistDir, 'skills'), {
	recursive: true
});
cpSync(join(HARNESS, 'patterns'), join(harnessDistDir, 'patterns'), {
	recursive: true
});
cpSync(join(HARNESS, 'guidance'), join(harnessDistDir, 'guidance'), {
	recursive: true
});
cpSync(join(OC_HARNESS_DIR, 'README.md'), join(DIST, 'README.md'));
cpSync(join(ROOT, 'LICENSE'), join(DIST, 'LICENSE'));

console.log('[build-publishable-opencode] writing package.json');
const publishedPackageJson = {
	$schema: 'https://www.schemastore.org/package.json',
	name: 'opencode-effect-harness',
	version: ocPkg.version,
	description: 'an OpenCode plugin for writing Effect v4 code',
	keywords: ['opencode', 'opencode-plugin', 'effect', 'effect-ts'],
	homepage: 'https://github.com/typedrat/pi-effect-harness#readme',
	bugs: { url: 'https://github.com/typedrat/pi-effect-harness/issues' },
	license: 'MIT',
	author: 'Marc Suesser; OpenCode adapter by typedrat',
	repository: {
		type: 'git',
		url: 'https://github.com/typedrat/pi-effect-harness.git'
	},
	type: 'module',
	main: './opencode/plugin.js',
	exports: { '.': './opencode/plugin.js' },
	files: [
		'opencode',
		'harnesses',
		'README.md',
		'LICENSE'
	],
	dependencies: {
		'@ast-grep/napi': resolveCatalog(
			kernelPkg.dependencies['@ast-grep/napi'],
			'@ast-grep/napi'
		),
		'@effect/platform-node': rootPkg.catalog['@effect/platform-node'],
		effect: rootPkg.catalog.effect,
		picomatch: kernelPkg.dependencies.picomatch,
		yaml: kernelPkg.dependencies.yaml
	},
	peerDependencies: {
		'@opencode-ai/plugin': '^1.15.0'
	}
};

writeFileSync(
	join(DIST, 'package.json'),
	`${JSON.stringify(publishedPackageJson, null, 2)}\n`
);

console.log('[build-publishable-opencode] done. tarball ready in', DIST);
