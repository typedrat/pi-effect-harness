#!/usr/bin/env bun
/**
 * Dispatcher for the per-host publishable builds.
 *
 *   bun run scripts/build-publishable.ts            # pi (default)
 *   bun run scripts/build-publishable.ts pi
 *   bun run scripts/build-publishable.ts opencode
 *   bun run scripts/build-publishable.ts all
 */

const target = process.argv[2];

if (target !== undefined && !['pi', 'opencode', 'all'].includes(target)) {
	console.error(
		`Unknown target: ${target}. Expected one of: pi, opencode, all.`
	);
	process.exit(1);
}

if (target === undefined || target === 'pi' || target === 'all') {
	await import('./build-publishable-pi.ts');
}

if (target === 'opencode' || target === 'all') {
	await import('./build-publishable-opencode.ts');
}
