# opencode-effect-harness — parallel adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an OpenCode plugin adapter to the existing `pi-effect-harness` workspace alongside the Pi adapter, working on `typedrat`'s fork. Both adapters share the kernel, rules, atoms, skills, patterns, and guidance. The fork is itself the prototype PR — when complete, offer it upstream; if rejected, publish `opencode-effect-harness` from the fork.

**Architecture:** Per-host subdirectories for the adapter files that genuinely differ between Pi and OpenCode (`packages/harness-kit/src/kernel/adapters/{pi,opencode}/` and `harnesses/effect/src/hooks/{pi,opencode}/`). Shared everything else. `EffectHarnessLayer` gets two factory functions, `forPi(config)` and `forOpenCode(config)`. A new shared `SessionStateStore` service backs the OpenCode adapter's branch-metadata substitute. The Pi adapter's existing behavior is preserved bit-for-bit; verify with the existing test suite before and after every change.

**Tech Stack:** TypeScript + Bun + Effect v4 (beta.65 if compatible with `pi-coding-agent`). OpenCode plugin host via `@opencode-ai/plugin@1.15.0`. Vitest. dprint + oxlint + tsgo.

**Spec:** [`docs/specs/2026-05-15-opencode-effect-harness-cutover-design.md`](../specs/2026-05-15-opencode-effect-harness-cutover-design.md)

**Upstream:** [`mpsuesser/pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness). Work happens on the fork at `typedrat/pi-effect-harness`. When done, offer the work upstream as a PR; otherwise publish `opencode-effect-harness` from the fork.

---

## File structure (target state)

```
pi-effect-harness/                                  # repo name; may be renamed upstream later if accepted
├── package.json                                    # unchanged top-level structure; new workspace entry (harnesses/opencode-effect)
├── opencode/                                       # NEW
│   └── plugin.ts                                   # OpenCode plugin entrypoint
├── commands/                                       # NEW
│   └── toggle-effect-harness.md
├── packages/
│   └── harness-kit/                                # name unchanged: pi-harness-kit (internal workspace package)
│       └── src/
│           ├── (host-agnostic core — UNCHANGED)
│           ├── Decision.ts, Pattern.ts, WriteIntent.ts, ...
│           ├── kernel/
│           │   ├── (HarnessRule, HarnessHook, services/, layers/, path/, MatcherInput — UNCHANGED)
│           │   └── adapters/
│           │       ├── pi/                         # MOVED — was packages/harness-kit/src/kernel/adapters/*.ts
│           │       │   ├── DecisionExecutor.ts
│           │       │   ├── ToolEventSnapshot.ts
│           │       │   ├── BeforeAgentStartSnapshot.ts
│           │       │   └── BranchSnapshot.ts
│           │       └── opencode/                   # NEW
│           │           ├── DecisionExecutor.ts
│           │           ├── ToolEventSnapshot.ts
│           │           ├── BeforeAgentStartSnapshot.ts
│           │           └── BranchSnapshot.ts
│           ├── mode/
│           │   ├── ModeState.ts                    # UNCHANGED — host-agnostic
│           │   ├── pi/                             # MOVED — was packages/harness-kit/src/mode/*.ts (minus ModeState)
│           │   │   ├── GitBranch.ts
│           │   │   ├── ModePersistence.ts
│           │   │   └── mode-toggle.ts              # MOVED — was packages/harness-kit/src/mode-toggle.ts
│           │   └── opencode/                       # NEW
│           │       └── ModePersistence.ts          # OpenCode-flavored project-scoped JSON
│           └── session-state/                      # NEW
│               └── SessionStateStore.ts
├── harnesses/effect/
│   ├── package.json                                # unchanged — pi-effect-harness manifest
│   ├── skills/, patterns/, guidance/, test/        # UNCHANGED — shared content
│   └── src/
│       ├── (atoms, services, constants, functions, rules — UNCHANGED)
│       ├── hooks/
│       │   ├── ClearPendingSkillReads.ts           # UNCHANGED — host-agnostic
│       │   ├── EnsureReferenceClone.ts             # UNCHANGED
│       │   ├── pi/                                 # MOVED — was harnesses/effect/src/hooks/*.ts (the three host-coupled ones)
│       │   │   ├── EmitSkillLoadedEntry.ts
│       │   │   ├── RebuildSkillCatalog.ts
│       │   │   └── TrackSkillRead.ts
│       │   └── opencode/                           # NEW
│       │       ├── EmitSkillLoadedEntry.ts
│       │       ├── RebuildSkillCatalog.ts
│       │       └── TrackSkillRead.ts
│       ├── layers/EffectHarnessLayer.ts            # MODIFIED — exports forPi and forOpenCode factory functions
│       └── index.ts                                # UNCHANGED — Pi extension entrypoint
├── harnesses/opencode-effect/                      # NEW workspace package
│   ├── package.json                                # name: opencode-effect-harness
│   ├── README.md
│   └── (no src — entrypoint is /opencode/plugin.ts; this package is for publishing)
├── scripts/
│   ├── build-publishable.ts                        # MODIFIED — dispatches to per-host build
│   ├── build-publishable-pi.ts                     # NEW (or extracted)
│   └── build-publishable-opencode.ts               # NEW
└── (unchanged from upstream)
    packages/agentsmd-undriftable/
    sandboxes/
    AGENTS.md, CONTRIBUTING.md, README.md          # all unchanged or appended-to
```

---
## Phase 1: Fork, verify preconditions, scaffold

Goal: working fork with Effect version sorted, OpenCode plugin deps installed, no-op plugin entrypoint loading. Pi adapter still passing all its tests untouched.

### Task 1: Fork the repository and set up the working branch

**Files:** none yet.

- [ ] **Step 1: Create the GitHub fork**

```bash
gh repo fork mpsuesser/pi-effect-harness --org typedrat --clone=false
```

Expected: GitHub fork created at `https://github.com/typedrat/pi-effect-harness`. (We keep the upstream name for now; the OpenCode adapter ships from `harnesses/opencode-effect/` as the npm package `opencode-effect-harness`.)

- [ ] **Step 2: Clone the fork**

```bash
cd ~/Development
git clone git@github.com:typedrat/pi-effect-harness.git pi-effect-harness-fork
cd pi-effect-harness-fork
git remote add upstream git@github.com:mpsuesser/pi-effect-harness.git
git fetch upstream --depth=1
```

Expected: `git remote -v` shows `origin` (typedrat) and `upstream` (mpsuesser).

- [ ] **Step 3: Create the working branch**

```bash
git checkout -b typedrat/opencode-adapter
```

- [ ] **Step 4: Verify the working tree builds and tests pass**

```bash
bun install
bun run check
bun run test
```

Expected: all pass on a fresh upstream clone. **If they don't, stop and fix the baseline before continuing** — you cannot tell what your changes broke if the starting state is red.

- [ ] **Step 5: Commit any lockfile refresh**

```bash
git status
# if bun.lock changed:
git add bun.lock && git commit -m "chore: refresh lockfile after fork"
# else no-op
```

### Task 2: Verify Effect version compatibility with the Pi host (precondition gate)

**Files:** none yet — investigation only.

This is the load-bearing risk from the spec. OpenCode's plugin host pins `effect@4.0.0-beta.65`. Upstream uses `4.0.0-beta.59`. If `@mariozechner/pi-coding-agent` is incompatible with beta.65, the parallel-adapter approach has a precondition issue: both adapters can't share a single Effect copy.

- [ ] **Step 1: Check pi-coding-agent's Effect peer/dep range**

```bash
npm view @mariozechner/pi-coding-agent dependencies.effect peerDependencies.effect
```

Record both values. If the result is `4.0.0-beta.59`, that's an exact pin — incompatible. If it's `^4.0.0-beta.59` (caret), beta.65 is compatible. If it's a range like `>=4.0.0-beta.59 <4.0.0-beta.70`, check.

- [ ] **Step 2: Trial-bump and test the Pi side**

In a scratch branch:

```bash
git checkout -b precondition-trial typedrat/opencode-adapter
```

Edit `package.json` `catalog`:

```jsonc
"catalog": {
  "@ast-grep/napi": "^0.40.5",
  "@effect/platform-node": "4.0.0-beta.65",
  "@effect/vitest": "4.0.0-beta.65",
  "effect": "4.0.0-beta.65"
},
"overrides": {
  "effect": "4.0.0-beta.65"
}
```

```bash
bun install
bun run check
bun run test
```

- [ ] **Step 3: Categorize the result**

**Scenario A — everything passes:** The Pi adapter survives the bump. Continue with the bump on the main branch (next task) and proceed normally.

**Scenario B — type errors only:** Pi-coding-agent's types changed between beta.59 and beta.65, but runtime compat is unclear. Spot-check by importing a Pi type and seeing if the error is cosmetic (e.g., a renamed `Either` → `Result`) or structural (e.g., a service witness moved). If cosmetic and fixable in a handful of lines, fix them on this branch; flag as upstream concern. Continue.

**Scenario C — runtime test failures or unrecoverable type errors:** The two hosts can't share an Effect copy. Three responses, in order of preference:

  1. **File an issue against `pi-mono`** asking for an Effect bump. This is the right long-term answer. Wait for it.
  2. **Keep both adapters separate at the package level.** This is a structural escalation: instead of `harnesses/opencode-effect/` being a sibling workspace, it becomes its own workspace package with its own `node_modules` and its own Effect version. The shared kernel becomes harder to share — you'd need to publish `pi-harness-kit` as a real package or duplicate its source. This is heavy enough to merit reopening the brainstorming flow rather than pushing through.
  3. **Defer the OpenCode adapter** until pi-mono upgrades.

Document the chosen response in a commit message and (if scenario B or C) in a new doc at `docs/precondition-effect-version.md` so the next person understands the decision.

- [ ] **Step 4: Decide and proceed**

If scenario A (or fixable B):

```bash
git checkout typedrat/opencode-adapter
git merge precondition-trial   # or cherry-pick the bump commit
git branch -d precondition-trial
```

If scenario C without a fix: **stop the plan**. The precondition isn't met; revisit the design.

(In what follows, the rest of the plan assumes scenario A.)

### Task 3: Bump Effect to 4.0.0-beta.65 on the working branch

**Files:**
- Modify: `package.json` (root, `catalog` + `overrides`)

This task is a no-op if you already merged the precondition-trial branch in Task 2. Run it as a verification step.

- [ ] **Step 1: Verify the catalog**

```bash
rg "4.0.0-beta" package.json
```

Expected: all four entries (catalog `@effect/platform-node`, `@effect/vitest`, `effect`, and the `overrides.effect`) on `4.0.0-beta.65`.

- [ ] **Step 2: Verify everything still passes**

```bash
bun install
bun run check
bun run test
```

Expected: PASS.

- [ ] **Step 3: Commit (if not already)**

```bash
git status
# if package.json or bun.lock has uncommitted changes from the trial merge:
git add package.json bun.lock
git commit -m "deps: bump Effect to 4.0.0-beta.65 (Pi adapter remains compatible)"
```

### Task 4: Add OpenCode plugin dependencies

**Files:**
- Modify: `package.json` (root devDependencies)

We keep `@mariozechner/pi-coding-agent` exactly as-is (the Pi adapter still depends on it). We add `@opencode-ai/plugin` alongside.

- [ ] **Step 1: Add deps**

In root `package.json` `devDependencies`, **add** (don't remove anything):

```jsonc
"@opencode-ai/plugin": "1.15.0",
"@opencode-ai/sdk": "1.15.0"
```

- [ ] **Step 2: Install + verify**

```bash
bun install
bun -e "import('@opencode-ai/plugin').then(m => console.log(Object.keys(m)))"
```

Expected: install succeeds; the second command prints an object with at least `tool` exported.

- [ ] **Step 3: Run full check + test**

```bash
bun run check && bun run test
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add @opencode-ai/plugin and @opencode-ai/sdk for the new OpenCode adapter"
```

### Task 5: Move existing Pi-specific files into `pi/` subdirectories

**Files (move, no content change):**
- `packages/harness-kit/src/kernel/adapters/{DecisionExecutor,ToolEventSnapshot,BeforeAgentStartSnapshot,BranchSnapshot}.ts` → `packages/harness-kit/src/kernel/adapters/pi/*.ts`
- `packages/harness-kit/src/mode/{GitBranch,ModePersistence}.ts` → `packages/harness-kit/src/mode/pi/*.ts`
- `packages/harness-kit/src/mode-toggle.ts` → `packages/harness-kit/src/mode/pi/mode-toggle.ts`
- `harnesses/effect/src/hooks/{EmitSkillLoadedEntry,RebuildSkillCatalog,TrackSkillRead}.ts` → `harnesses/effect/src/hooks/pi/*.ts`

**Files NOT moved:**
- `packages/harness-kit/src/mode/ModeState.ts` stays at the `mode/` top level — it's host-agnostic, used by both adapters.

**Files (modify import paths):**
- `harnesses/effect/src/index.ts`
- `harnesses/effect/src/layers/EffectHarnessLayer.ts`
- Any test file that imports from the moved files

The goal of this task is a clean refactor: no behavior change, just relocate files into the future per-host subdir layout. Tests should pass identically before and after.

- [ ] **Step 1: Move the kernel adapter files**

```bash
mkdir -p packages/harness-kit/src/kernel/adapters/pi
git mv packages/harness-kit/src/kernel/adapters/DecisionExecutor.ts packages/harness-kit/src/kernel/adapters/pi/DecisionExecutor.ts
git mv packages/harness-kit/src/kernel/adapters/ToolEventSnapshot.ts packages/harness-kit/src/kernel/adapters/pi/ToolEventSnapshot.ts
git mv packages/harness-kit/src/kernel/adapters/BeforeAgentStartSnapshot.ts packages/harness-kit/src/kernel/adapters/pi/BeforeAgentStartSnapshot.ts
git mv packages/harness-kit/src/kernel/adapters/BranchSnapshot.ts packages/harness-kit/src/kernel/adapters/pi/BranchSnapshot.ts
```

- [ ] **Step 2: Move the mode files (Pi-specific only — ModeState stays)**

```bash
mkdir -p packages/harness-kit/src/mode/pi
git mv packages/harness-kit/src/mode/GitBranch.ts packages/harness-kit/src/mode/pi/GitBranch.ts
git mv packages/harness-kit/src/mode/ModePersistence.ts packages/harness-kit/src/mode/pi/ModePersistence.ts
git mv packages/harness-kit/src/mode-toggle.ts packages/harness-kit/src/mode/pi/mode-toggle.ts
```

Verify `ModeState.ts` is still at `packages/harness-kit/src/mode/ModeState.ts`:

```bash
ls packages/harness-kit/src/mode/ModeState.ts
```

Expected: file exists.

- [ ] **Step 3: Move the harness hook files**

```bash
mkdir -p harnesses/effect/src/hooks/pi
git mv harnesses/effect/src/hooks/EmitSkillLoadedEntry.ts harnesses/effect/src/hooks/pi/EmitSkillLoadedEntry.ts
git mv harnesses/effect/src/hooks/RebuildSkillCatalog.ts harnesses/effect/src/hooks/pi/RebuildSkillCatalog.ts
git mv harnesses/effect/src/hooks/TrackSkillRead.ts harnesses/effect/src/hooks/pi/TrackSkillRead.ts
```

- [ ] **Step 4: Find every importer**

```bash
rg -l "kernel/adapters/(DecisionExecutor|ToolEventSnapshot|BeforeAgentStartSnapshot|BranchSnapshot)" --type ts
rg -l "hooks/(EmitSkillLoadedEntry|RebuildSkillCatalog|TrackSkillRead)" --type ts
rg -l "mode/(GitBranch|ModePersistence)|mode-toggle" --type ts
```

Record every match.

- [ ] **Step 5: Update import paths**

For each file found above, update import paths to include the `pi/` segment. For example:

```ts
// before
import { writeIntentFromToolCall } from 'pi-harness-kit/kernel/adapters/ToolEventSnapshot.ts';
import { ModePersistence } from 'pi-harness-kit/mode/pi/ModePersistence.ts';
import { createModeToggle } from 'pi-harness-kit/mode-toggle.ts';

// after
import { writeIntentFromToolCall } from 'pi-harness-kit/kernel/adapters/pi/ToolEventSnapshot.ts';
import { ModePersistence } from 'pi-harness-kit/mode/pi/ModePersistence.ts';
import { createModeToggle } from 'pi-harness-kit/mode/pi/mode-toggle.ts';
```

`ModeState` import paths do **not** change — that file stays at `mode/ModeState.ts`.

Use sed for a bulk pass:

```bash
rg -l "kernel/adapters/DecisionExecutor" --type ts | xargs sed -i 's|kernel/adapters/DecisionExecutor|kernel/adapters/pi/DecisionExecutor|g'
rg -l "kernel/adapters/ToolEventSnapshot" --type ts | xargs sed -i 's|kernel/adapters/ToolEventSnapshot|kernel/adapters/pi/ToolEventSnapshot|g'
rg -l "kernel/adapters/BeforeAgentStartSnapshot" --type ts | xargs sed -i 's|kernel/adapters/BeforeAgentStartSnapshot|kernel/adapters/pi/BeforeAgentStartSnapshot|g'
rg -l "kernel/adapters/BranchSnapshot" --type ts | xargs sed -i 's|kernel/adapters/BranchSnapshot|kernel/adapters/pi/BranchSnapshot|g'

rg -l "hooks/EmitSkillLoadedEntry" --type ts | xargs sed -i 's|hooks/EmitSkillLoadedEntry|hooks/pi/EmitSkillLoadedEntry|g'
rg -l "hooks/RebuildSkillCatalog" --type ts | xargs sed -i 's|hooks/RebuildSkillCatalog|hooks/pi/RebuildSkillCatalog|g'
rg -l "hooks/TrackSkillRead" --type ts | xargs sed -i 's|hooks/TrackSkillRead|hooks/pi/TrackSkillRead|g'

rg -l "mode/GitBranch" --type ts | xargs sed -i 's|mode/GitBranch|mode/pi/GitBranch|g'
rg -l "mode/ModePersistence" --type ts | xargs sed -i 's|mode/ModePersistence|mode/pi/ModePersistence|g'
rg -l "'pi-harness-kit/mode-toggle" --type ts | xargs sed -i "s|'pi-harness-kit/mode-toggle|'pi-harness-kit/mode/pi/mode-toggle|g"
```

(BSD sed users: replace `sed -i ...` with `sed -i '' ...`.)

After running the sed pass, **verify ModeState imports are untouched**:

```bash
rg "pi-harness-kit/mode/ModeState" --type ts
```

Expected: matches still point at `mode/ModeState.ts` (no `pi/` segment). If any were rewritten to `mode/pi/ModeState`, revert those — the third sed substitution above is intentionally pattern-anchored to `mode/ModePersistence` (not just `mode/Mode`) to avoid that.

- [ ] **Step 6: Verify**

```bash
bun run check
bun run test
```

Expected: PASS, identical results to before the move. This is a pure refactor; any behavior change here is a bug.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move Pi-specific adapters, mode files, and hooks into pi/ subdirs

Prepares for an OpenCode adapter living alongside in opencode/ subdirs.
ModeState stays at mode/ModeState.ts (host-agnostic). No behavior change."
```

### Task 6: Scaffold the OpenCode plugin entrypoint as a no-op

**Files:**
- Create: `opencode/plugin.ts`
- Create: `harnesses/opencode-effect/package.json`
- Modify: `package.json` (root, `workspaces`)

- [ ] **Step 1: Create the workspace package skeleton**

Create `harnesses/opencode-effect/package.json`:

```jsonc
{
  "$schema": "https://www.schemastore.org/package.json",
  "name": "opencode-effect-harness",
  "version": "0.1.0",
  "description": "an OpenCode plugin for writing Effect v4 code, sibling to pi-effect-harness",
  "keywords": [
    "opencode",
    "opencode-plugin",
    "effect",
    "effect-ts"
  ],
  "homepage": "https://github.com/typedrat/pi-effect-harness#readme",
  "bugs": {
    "url": "https://github.com/typedrat/pi-effect-harness/issues"
  },
  "license": "MIT",
  "author": "Marc Suesser; OpenCode adapter by typedrat",
  "repository": {
    "type": "git",
    "url": "https://github.com/typedrat/pi-effect-harness.git"
  },
  "type": "module",
  "files": [
    "dist",
    "skills",
    "patterns",
    "guidance",
    "commands",
    "README.md",
    "LICENSE"
  ],
  "main": "./dist/plugin.js",
  "exports": {
    ".": "./dist/plugin.js"
  },
  "dependencies": {
    "@effect/platform-node": "catalog:",
    "effect": "catalog:",
    "pi-harness-kit": "workspace:*",
    "pi-effect-harness": "workspace:*"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.15.0"
  }
}
```

This package consumes both `pi-harness-kit` (the internal kernel package, which doesn't change) and `pi-effect-harness` (the existing harnesses/effect workspace, for the rules, atoms, services, and shared hooks). The actual built artifact will inline both at publish time.

Also create an empty `harnesses/opencode-effect/README.md` for now (we fill it in Task 21):

```bash
mkdir -p harnesses/opencode-effect
echo "# opencode-effect-harness" > harnesses/opencode-effect/README.md
```

- [ ] **Step 2: Register the workspace**

In root `package.json`, the `workspaces` array currently looks like:

```jsonc
"workspaces": [
  "packages/*",
  "harnesses/*",
  "sandboxes/*"
]
```

The `harnesses/*` glob already picks up `harnesses/opencode-effect/`. No change needed. Verify:

```bash
bun install
bun pm ls 2>&1 | rg "opencode-effect-harness"
```

Expected: `opencode-effect-harness@0.1.0` appears in the workspace list.

- [ ] **Step 3: Create the no-op plugin entrypoint**

Create `opencode/plugin.ts`:

```ts
import type { Plugin } from '@opencode-ai/plugin';

/**
 * opencode-effect-harness — OpenCode plugin entrypoint.
 *
 * Currently a no-op placeholder. Real hook implementations land in later tasks.
 */
const effectHarnessPlugin: Plugin = async (_ctx) => {
	return {};
};

export default effectHarnessPlugin;
```

- [ ] **Step 4: Verify it typechecks**

```bash
bun run check
```

Expected: PASS. The new file imports only `@opencode-ai/plugin` which we added in Task 4.

If tsgo can't find `opencode/plugin.ts` because the root `tsconfig` doesn't include the directory, add `opencode/` to the include list in `tsconfig.json` (root). Verify with a fresh `bun run check`.

- [ ] **Step 5: Verify OpenCode loads it**

```bash
mkdir -p /tmp/opencode-harness-smoke && cd /tmp/opencode-harness-smoke
cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["$HOME/Development/pi-effect-harness-fork/opencode/plugin.ts"]
}
EOF
opencode --help 2>&1 | head -5
```

Expected: OpenCode prints its help text without complaining about a plugin load failure. Cleanup: `rm -rf /tmp/opencode-harness-smoke`.

- [ ] **Step 6: Commit**

```bash
cd ~/Development/pi-effect-harness-fork
git add -A
git commit -m "feat: scaffold no-op OpenCode plugin entrypoint

Adds harnesses/opencode-effect/ as a new workspace package and
opencode/plugin.ts as the plugin source. No-op for now; real hooks land
in later tasks. Pi adapter is unchanged."
```

---
## Phase 2: Shared services (SessionStateStore, OpenCode ModePersistence)

Goal: build the new services the OpenCode adapter needs, with tests. Pi adapter still unchanged at the end of this phase.

### Task 7: Create SessionStateStore service

**Files:**
- Create: `packages/harness-kit/src/session-state/SessionStateStore.ts`
- Create: `packages/harness-kit/test/SessionStateStore.test.ts`

The OpenCode adapter has no equivalent to Pi's `appendEntry` for invisible session-branch metadata. We replace it with a per-session sidecar JSON store. The Pi adapter doesn't use this service.

- [ ] **Step 1: Write the failing test**

Create `packages/harness-kit/test/SessionStateStore.test.ts`:

```ts
import { Effect, Layer } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
	) =>
		Effect.runPromise(
			effect.pipe(
				Effect.provide(
					SessionStateStore.layer(rootDir).pipe(Layer.provide(platformLayer))
				)
			)
		);

	it('returns empty set for unknown session', async () => {
		const result = await runWith(
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect(result.size).toBe(0);
	});

	it('records and reads back a skill load', async () => {
		const result = await runWith(
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('session-A', 'effect-error-handling');
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect([...result].sort()).toEqual(['effect-error-handling']);
	});

	it('deduplicates repeated records', async () => {
		const result = await runWith(
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('session-A', 'effect-error-handling');
				yield* store.recordSkillLoad('session-A', 'effect-error-handling');
				yield* store.recordSkillLoad('session-A', 'effect-layer-design');
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
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('session-A', 'effect-error-handling');
				yield* store.recordSkillLoad('session-B', 'effect-layer-design');
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
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('session-A', 'effect-error-handling');
				yield* store.clearSession('session-A');
				return yield* store.getLoadedSkills('session-A');
			})
		);
		expect(result.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run packages/harness-kit/test/SessionStateStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionStateStore**

Create `packages/harness-kit/src/session-state/SessionStateStore.ts`:

```ts
import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Path,
	Ref,
	Schema
} from 'effect';

class StoredSessionState extends Schema.Class<StoredSessionState>(
	'StoredSessionState'
)({
	version: Schema.Literal(1),
	loadedSkills: Schema.Array(Schema.String)
}) {}

const decode = Schema.decodeUnknownSync(
	Schema.fromJsonString(StoredSessionState)
);
const encode = Schema.encodeSync(
	Schema.fromJsonString(StoredSessionState)
);

const encodeSessionSegment = (value: string): string =>
	encodeURIComponent(value);

export namespace SessionStateStore {
	export interface Interface {
		readonly recordSkillLoad: (
			sessionId: string,
			name: string
		) => Effect.Effect<void>;
		readonly getLoadedSkills: (
			sessionId: string
		) => Effect.Effect<ReadonlySet<string>>;
		readonly clearSession: (sessionId: string) => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/session-state/SessionStateStore'
	) {}

	export const layer = (rootDir: string) =>
		Layer.effect(
			Service,
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const cache = yield* Ref.make<ReadonlyMap<string, Set<string>>>(
					new Map()
				);

				const sessionsDir = path.join(rootDir, 'sessions');

				const filePathFor = (sessionId: string) =>
					path.join(
						sessionsDir,
						`${encodeSessionSegment(sessionId)}.json`
					);

				const loadFromDisk = (sessionId: string) =>
					Effect.gen(function* () {
						const file = filePathFor(sessionId);
						const exists = yield* fs.exists(file).pipe(
							Effect.orElseSucceed(() => false)
						);
						if (!exists) {
							return new Set<string>();
						}
						const content = yield* fs.readFileString(file).pipe(
							Effect.orElseSucceed(() => '')
						);
						if (content === '') {
							return new Set<string>();
						}
						const decoded = yield* Effect.try({
							try: () => decode(content),
							catch: () => undefined
						}).pipe(Effect.orElseSucceed(() => undefined));
						return decoded === undefined
							? new Set<string>()
							: new Set(decoded.loadedSkills);
					});

				const get = (sessionId: string) =>
					Effect.gen(function* () {
						const map = yield* Ref.get(cache);
						const cached = map.get(sessionId);
						if (cached !== undefined) {
							return cached;
						}
						const loaded = yield* loadFromDisk(sessionId);
						yield* Ref.update(cache, (m) =>
							new Map(m).set(sessionId, loaded)
						);
						return loaded;
					});

				const writeToDisk = (
					sessionId: string,
					skills: ReadonlySet<string>
				) =>
					Effect.gen(function* () {
						yield* fs.makeDirectory(sessionsDir, {
							recursive: true
						}).pipe(Effect.orElseSucceed(() => undefined));
						const payload = new StoredSessionState({
							version: 1,
							loadedSkills: [...skills].sort()
						});
						const content = encode(payload);
						const file = filePathFor(sessionId);
						const tmp = `${file}.tmp`;
						yield* fs.writeFileString(tmp, content);
						yield* fs.rename(tmp, file).pipe(
							Effect.orElseSucceed(() => undefined)
						);
					});

				const recordSkillLoad: Interface['recordSkillLoad'] = (
					sessionId,
					name
				) =>
					Effect.gen(function* () {
						const current = new Set(yield* get(sessionId));
						if (current.has(name)) {
							return;
						}
						current.add(name);
						yield* Ref.update(cache, (m) =>
							new Map(m).set(sessionId, current)
						);
						yield* writeToDisk(sessionId, current);
					});

				const getLoadedSkills: Interface['getLoadedSkills'] = (
					sessionId
				) => Effect.map(get(sessionId), (s) => s as ReadonlySet<string>);

				const clearSession: Interface['clearSession'] = (sessionId) =>
					Effect.gen(function* () {
						yield* Ref.update(cache, (m) => {
							const next = new Map(m);
							next.delete(sessionId);
							return next;
						});
						const file = filePathFor(sessionId);
						yield* fs.remove(file).pipe(
							Effect.orElseSucceed(() => undefined)
						);
					});

				return Service.of({
					recordSkillLoad,
					getLoadedSkills,
					clearSession
				});
			})
		);
}
```

Note the service tag is `pi-harness-kit/session-state/...` — we keep the package name `pi-harness-kit` because that's what the workspace package is still called.

- [ ] **Step 4: Run the test**

```bash
bunx vitest run packages/harness-kit/test/SessionStateStore.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run full check + test**

```bash
bun run check && bun run test
```

Expected: all pass. The new file is self-contained; Pi tests are unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-kit/src/session-state packages/harness-kit/test/SessionStateStore.test.ts
git commit -m "feat: add SessionStateStore for OpenCode-adapter skill-load tracking

Sidecar JSON-per-session store, parameterized by rootDir. Pi adapter
doesn't use this; the kit gains a new service the OpenCode adapter will
consume."
```

### Task 8: Create the OpenCode-flavored ModePersistence

**Files:**
- Create: `packages/harness-kit/src/mode/opencode/ModePersistence.ts`
- Create: `packages/harness-kit/test/mode/opencode/ModePersistence.test.ts`

The Pi-flavored ModePersistence (now at `packages/harness-kit/src/mode/pi/ModePersistence.ts` after Task 5) supports four scopes (`session`/`project`/`branch`/`global`), reads `HOME`/`USERPROFILE` via Effect `Config`, and lays out files under Pi's session-directory convention. The OpenCode adapter only needs `project` scope and writes to a fixed cache directory; making the Pi version variadic enough to do both would obscure both intents. Cleaner: a sibling service under `mode/opencode/`.

Both services share the `ModeState` interface (which is just `isEnabled` / `setEnabled`).

- [ ] **Step 1: Write the failing test**

Create `packages/harness-kit/test/mode/opencode/ModePersistence.test.ts`:

```ts
import { Effect, Layer } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
	) =>
		Effect.runPromise(
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
			Effect.flatMap(OpenCodeModePersistence.Service, (p) =>
				p.load('project-xyz')
			)
		);
		expect(result).toBeUndefined();
	});

	it('save then load round-trips true', async () => {
		const result = await runWith(
			Effect.gen(function* () {
				const p = yield* OpenCodeModePersistence.Service;
				yield* p.save('project-xyz', true);
				return yield* p.load('project-xyz');
			})
		);
		expect(result).toBe(true);
	});

	it('save then load round-trips false', async () => {
		const result = await runWith(
			Effect.gen(function* () {
				const p = yield* OpenCodeModePersistence.Service;
				yield* p.save('project-xyz', false);
				return yield* p.load('project-xyz');
			})
		);
		expect(result).toBe(false);
	});

	it('isolates projects', async () => {
		const result = await runWith(
			Effect.gen(function* () {
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run packages/harness-kit/test/mode/opencode/ModePersistence.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement OpenCodeModePersistence**

Create `packages/harness-kit/src/mode/opencode/ModePersistence.ts`:

```ts
import {
	Context,
	Effect,
	FileSystem,
	Layer,
	Path,
	Schema
} from 'effect';

class PersistedModeState extends Schema.Class<PersistedModeState>(
	'OpenCodePersistedModeState'
)({
	version: Schema.Literal(1),
	enabled: Schema.Boolean
}) {}

const decode = Schema.decodeUnknownSync(
	Schema.fromJsonString(PersistedModeState)
);
const encode = Schema.encodeSync(Schema.fromJsonString(PersistedModeState));

const encodeProjectSegment = (value: string): string =>
	encodeURIComponent(value);

export namespace OpenCodeModePersistence {
	export interface Interface {
		readonly load: (
			projectId: string
		) => Effect.Effect<boolean | undefined>;
		readonly save: (
			projectId: string,
			enabled: boolean
		) => Effect.Effect<void>;
	}

	export class Service extends Context.Service<Service, Interface>()(
		'pi-harness-kit/mode/opencode/ModePersistence'
	) {}

	export const layer = (rootDir: string) =>
		Layer.effect(
			Service,
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;

				const projectsDir = path.join(rootDir, 'projects');

				const filePathFor = (projectId: string) =>
					path.join(
						projectsDir,
						encodeProjectSegment(projectId),
						'mode.json'
					);

				const load: Interface['load'] = (projectId) =>
					Effect.gen(function* () {
						const file = filePathFor(projectId);
						const exists = yield* fs.exists(file).pipe(
							Effect.orElseSucceed(() => false)
						);
						if (!exists) {
							return undefined;
						}
						const content = yield* fs.readFileString(file).pipe(
							Effect.orElseSucceed(() => '')
						);
						if (content === '') {
							return undefined;
						}
						const decoded = yield* Effect.try({
							try: () => decode(content),
							catch: () => undefined
						}).pipe(Effect.orElseSucceed(() => undefined));
						return decoded?.enabled;
					});

				const save: Interface['save'] = (projectId, enabled) =>
					Effect.gen(function* () {
						const file = filePathFor(projectId);
						yield* fs.makeDirectory(path.dirname(file), {
							recursive: true
						}).pipe(Effect.orElseSucceed(() => undefined));
						const content = encode(
							new PersistedModeState({ version: 1, enabled })
						);
						const tmp = `${file}.tmp`;
						yield* fs.writeFileString(tmp, content);
						yield* fs.rename(tmp, file).pipe(
							Effect.orElseSucceed(() => undefined)
						);
					});

				return Service.of({ load, save });
			})
		);
}
```

- [ ] **Step 4: Run the test**

```bash
bunx vitest run packages/harness-kit/test/mode/opencode/ModePersistence.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run full check + test**

```bash
bun run check && bun run test
```

Expected: PASS. Pi tests still untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-kit/src/mode/opencode packages/harness-kit/test/mode/opencode
git commit -m "feat: add OpenCodeModePersistence for project-scoped JSON

Sibling service to the existing Pi-flavored ModePersistence. Keeps the
Pi-flavored one untouched (the Pi adapter still uses it). Parameterized
by rootDir; the OpenCode plugin entrypoint will provide
~/.cache/opencode-effect-harness/."
```

---
## Phase 3: OpenCode adapters

Goal: build the four OpenCode adapter files (DecisionExecutor, ToolEventSnapshot, BeforeAgentStartSnapshot, BranchSnapshot) under `packages/harness-kit/src/kernel/adapters/opencode/`, alongside the Pi versions that are unchanged.

### Task 9: OpenCode BranchSnapshot

**Files:**
- Create: `packages/harness-kit/src/kernel/adapters/opencode/BranchSnapshot.ts`
- Create: `packages/harness-kit/src/kernel/adapters/opencode/BeforeAgentStartSnapshot.ts`
- Create: `packages/harness-kit/test/opencode-adapters/BranchSnapshot.test.ts`

The OpenCode `BranchSnapshot.fromSessionStateStore(sessionId)` reads `SessionStateStore` and produces an `ActiveBranch.Value` populated with synthetic `CustomEntry` records using customType `pi-effect-harness:skill-loaded`. The downstream atom (`activeBranchLoadedEffectSkills`) reads these without knowing or caring whether they came from Pi's `appendEntry` or our SessionStateStore.

- [ ] **Step 1: Confirm the customType constant**

```bash
rg "SKILL_LOADED_ENTRY" harnesses/effect/src/constants.ts
```

Record the exact value (should be `'pi-effect-harness:skill-loaded'`). The synthetic entries must use the same string or the atom won't see them.

- [ ] **Step 2: Write the test**

Create `packages/harness-kit/test/opencode-adapters/BranchSnapshot.test.ts`:

```ts
import { Effect, Layer } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
					SessionStateStore.layer(rootDir).pipe(Layer.provide(platformLayer))
				)
			)
		);
		expect(branch.entries.length).toBe(0);
	});

	it('produces one CustomEntry per loaded skill, sorted', async () => {
		const branch = await Effect.runPromise(
			Effect.gen(function* () {
				const store = yield* SessionStateStore.Service;
				yield* store.recordSkillLoad('s1', 'effect-error-handling');
				yield* store.recordSkillLoad('s1', 'effect-layer-design');
				return yield* fromSessionStateStore('s1');
			}).pipe(
				Effect.provide(
					SessionStateStore.layer(rootDir).pipe(Layer.provide(platformLayer))
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
			.map((e) => (e.data as { name: string }).name)
			.sort();
		expect(names).toEqual(['effect-error-handling', 'effect-layer-design']);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/BranchSnapshot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement opencode BranchSnapshot**

Create `packages/harness-kit/src/kernel/adapters/opencode/BranchSnapshot.ts`:

```ts
import { Effect } from 'effect';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';

const SKILL_LOADED_ENTRY = 'pi-effect-harness:skill-loaded';

/**
 * Build an ActiveBranch.Value from the SessionStateStore.
 *
 * The synthetic CustomEntry records use the same customType the Pi adapter
 * writes to session-branch metadata via `appendEntry`, so the downstream
 * `activeBranchLoadedEffectSkills` atom (in harnesses/effect/src/atoms/) reads
 * skill-loaded state identically regardless of which adapter populated it.
 *
 * If you change SKILL_LOADED_ENTRY here, also update
 * harnesses/effect/src/constants.ts to match.
 */
export const fromSessionStateStore = (
	sessionId: string
): Effect.Effect<ActiveBranch.Value, never, SessionStateStore.Service> =>
	Effect.gen(function* () {
		const store = yield* SessionStateStore.Service;
		const loaded = yield* store.getLoadedSkills(sessionId);
		const sorted = [...loaded].sort();
		const entries = sorted.map(
			(name, index) =>
				new ActiveBranch.CustomEntry({
					id: `synthetic:skill-loaded:${index}`,
					customType: SKILL_LOADED_ENTRY,
					data: { name }
				})
		);
		return new ActiveBranch.Value({ entries });
	});
```

- [ ] **Step 5: Implement opencode BeforeAgentStartSnapshot**

Create `packages/harness-kit/src/kernel/adapters/opencode/BeforeAgentStartSnapshot.ts`:

```ts
import { Effect } from 'effect';

import { ActiveBranch } from '../../../ActiveBranch.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';
import { fromSessionStateStore } from './BranchSnapshot.ts';

/**
 * The OpenCode plugin calls this on every hook fire to produce an
 * ActiveBranch.Value the rules can consume. It's a thin re-export of
 * BranchSnapshot.fromSessionStateStore for naming symmetry with the Pi
 * adapter's `activeBranchFromContext`.
 */
export const activeBranchForSession = (
	sessionId: string
): Effect.Effect<ActiveBranch.Value, never, SessionStateStore.Service> =>
	fromSessionStateStore(sessionId);
```

- [ ] **Step 6: Run the test**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/BranchSnapshot.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 7: Run full check + test**

```bash
bun run check && bun run test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/harness-kit/src/kernel/adapters/opencode packages/harness-kit/test/opencode-adapters
git commit -m "feat: add OpenCode BranchSnapshot + BeforeAgentStartSnapshot adapters

Reads skill-loaded state from SessionStateStore and produces an
ActiveBranch.Value with the same synthetic CustomEntry shape the Pi
adapter writes via appendEntry. Downstream atoms work without
modification."
```

### Task 10: OpenCode ToolEventSnapshot

**Files:**
- Create: `packages/harness-kit/src/kernel/adapters/opencode/ToolEventSnapshot.ts`
- Create: `packages/harness-kit/test/opencode-adapters/ToolEventSnapshot.test.ts`

OpenCode's `tool.execute.before` hook input is `{ tool: string, sessionID: string, callID: string }` plus `output.args`. `tool.execute.after` has `{ tool, sessionID, callID, args }` plus `{ title, output, metadata }`. Produce `WriteIntent.Value`s for `write`/`edit` tools.

OpenCode's `edit` tool args may be either Pi-style `{ edits: [...] }` arrays or OpenCode's single-replacement `{ oldString, newString, replaceAll }` shape. Accept both.

- [ ] **Step 1: Write the test**

Create `packages/harness-kit/test/opencode-adapters/ToolEventSnapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
	writeIntentFromToolExecuteAfter,
	writeIntentFromToolExecuteBefore
} from '../../src/kernel/adapters/opencode/ToolEventSnapshot.ts';
import { WriteIntent } from '../../src/WriteIntent.ts';

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
			const intent = writeIntentFromToolExecuteBefore(
				{ tool: 'write', sessionID: 's', callID: 'c' },
				{ args: { filePath: '/a/b.ts', content: 'hello' } }
			);
			expect(intent).toBeInstanceOf(WriteIntent.WriteFile);
			if (intent instanceof WriteIntent.WriteFile) {
				expect(intent.phase).toBe('tool_call');
				expect(intent.filePath).toBe('/a/b.ts');
				expect(intent.content).toBe('hello');
			}
		});

		it('builds an EditFile intent from OpenCode-style edit args', () => {
			const intent = writeIntentFromToolExecuteBefore(
				{ tool: 'edit', sessionID: 's', callID: 'c' },
				{
					args: {
						filePath: '/a/b.ts',
						oldString: 'foo',
						newString: 'bar',
						replaceAll: false
					}
				}
			);
			expect(intent).toBeInstanceOf(WriteIntent.EditFile);
			if (intent instanceof WriteIntent.EditFile) {
				expect(intent.phase).toBe('tool_call');
				expect(intent.replacements.length).toBe(1);
				expect(intent.replacements[0]!.oldText).toBe('foo');
				expect(intent.replacements[0]!.newText).toBe('bar');
			}
		});

		it('builds an EditFile intent from Pi-style edits array', () => {
			const intent = writeIntentFromToolExecuteBefore(
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
			);
			expect(intent).toBeInstanceOf(WriteIntent.EditFile);
			if (intent instanceof WriteIntent.EditFile) {
				expect(intent.replacements.length).toBe(2);
			}
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
			const intent = writeIntentFromToolExecuteAfter({
				tool: 'write',
				sessionID: 's',
				callID: 'c',
				args: { filePath: '/a/b.ts', content: 'hello' }
			});
			expect(intent).toBeInstanceOf(WriteIntent.WriteFile);
			if (intent instanceof WriteIntent.WriteFile) {
				expect(intent.phase).toBe('tool_result');
			}
		});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/ToolEventSnapshot.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/harness-kit/src/kernel/adapters/opencode/ToolEventSnapshot.ts`:

```ts
import { Predicate } from 'effect';

import { EditReplacement } from '../../../EditReplacement.ts';
import { WriteIntent } from '../../../WriteIntent.ts';

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
}): WriteIntent.Value | undefined => {
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
	input: { readonly tool: string; readonly sessionID: string; readonly callID: string },
	output: { readonly args: unknown }
): WriteIntent.Value | undefined =>
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
}): WriteIntent.Value | undefined =>
	input.tool === 'write' || input.tool === 'edit'
		? writeIntentFrom({
			args: input.args,
			phase: 'tool_result',
			toolName: input.tool
		})
		: undefined;
```

- [ ] **Step 4: Run the test**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/ToolEventSnapshot.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run full check + test**

```bash
bun run check && bun run test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-kit/src/kernel/adapters/opencode/ToolEventSnapshot.ts packages/harness-kit/test/opencode-adapters/ToolEventSnapshot.test.ts
git commit -m "feat: add OpenCode ToolEventSnapshot adapter

Translates OpenCode's tool.execute.before/after input + output shapes into
WriteIntent values. Accepts both Pi-style edits arrays and OpenCode's
single-replacement form."
```

### Task 11: OpenCode DecisionExecutor

**Files:**
- Create: `packages/harness-kit/src/kernel/adapters/opencode/DecisionExecutor.ts`
- Create: `packages/harness-kit/test/opencode-adapters/DecisionExecutor.test.ts`

This is the file that translates `Decision` values into OpenCode side effects:
- `BlockToolCall.reason` is extracted; the caller throws.
- `InjectSystemPrompt.content` strings are collected; the caller pushes them onto `output.system`.
- `InjectUserMessage` is delivered via `client.session.prompt({ ... })`.
- `AppendCustomEntry` with `customType === 'pi-effect-harness:skill-loaded'` records into `SessionStateStore`. Other custom entry types are no-ops (the Pi adapter uses several; we only handle the one we emit).

- [ ] **Step 1: Write the test**

Create `packages/harness-kit/test/opencode-adapters/DecisionExecutor.test.ts`:

```ts
import { Effect, Layer } from 'effect';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Decision } from '../../src/Decision.ts';
import {
	collectSystemPromptAdditions,
	executeSideEffects,
	findBlockReason
} from '../../src/kernel/adapters/opencode/DecisionExecutor.ts';
import { SessionStateStore } from '../../src/session-state/SessionStateStore.ts';
import { UserMessage } from '../../src/UserMessage.ts';

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe('opencode DecisionExecutor', () => {
	let rootDir: string;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'oc-decision-exec-test-'));
	});

	afterEach(() => {
		rmSync(rootDir, { recursive: true, force: true });
	});

	describe('collectSystemPromptAdditions', () => {
		it('returns empty array when no InjectSystemPrompt decisions present', () => {
			expect(collectSystemPromptAdditions([])).toEqual([]);
		});

		it('extracts content in order, skipping non-InjectSystemPrompt decisions', () => {
			const decisions = [
				new Decision.InjectSystemPrompt({ content: 'first' }),
				new Decision.BlockToolCall({ reason: 'unrelated' }),
				new Decision.InjectSystemPrompt({ content: 'second' })
			];
			expect(collectSystemPromptAdditions(decisions)).toEqual([
				'first',
				'second'
			]);
		});
	});

	describe('findBlockReason', () => {
		it('returns undefined when no BlockToolCall present', () => {
			expect(findBlockReason([])).toBeUndefined();
		});

		it('returns the first BlockToolCall reason', () => {
			const decisions = [
				new Decision.InjectSystemPrompt({ content: 'x' }),
				new Decision.BlockToolCall({ reason: 'load skills first' })
			];
			expect(findBlockReason(decisions)).toBe('load skills first');
		});
	});

	describe('executeSideEffects', () => {
		it('records skill-loaded custom entries via SessionStateStore', async () => {
			const promptMock = vi.fn().mockResolvedValue(undefined);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.AppendCustomEntry({
							customType: 'pi-effect-harness:skill-loaded',
							data: { name: 'effect-error-handling' }
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			const loaded = await Effect.runPromise(
				Effect.flatMap(SessionStateStore.Service, (s) =>
					s.getLoadedSkills('session-A')
				).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);
			expect([...loaded]).toEqual(['effect-error-handling']);
			expect(promptMock).not.toHaveBeenCalled();
		});

		it('ignores AppendCustomEntry with non-skill-loaded customType', async () => {
			const promptMock = vi.fn().mockResolvedValue(undefined);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.AppendCustomEntry({
							customType: 'some-other-type',
							data: { name: 'whatever' }
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			const loaded = await Effect.runPromise(
				Effect.flatMap(SessionStateStore.Service, (s) =>
					s.getLoadedSkills('session-A')
				).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);
			expect(loaded.size).toBe(0);
		});

		it('delivers InjectUserMessage via client.session.prompt', async () => {
			const promptMock = vi.fn().mockResolvedValue(undefined);
			const client = {
				session: { prompt: promptMock }
			} as unknown as Parameters<typeof executeSideEffects>[0]['client'];

			await Effect.runPromise(
				executeSideEffects({
					client,
					sessionId: 'session-A',
					decisions: [
						new Decision.InjectUserMessage({
							message: new UserMessage.Value({ content: 'hello' })
						})
					]
				}).pipe(
					Effect.provide(
						SessionStateStore.layer(rootDir).pipe(
							Layer.provide(platformLayer)
						)
					)
				)
			);

			expect(promptMock).toHaveBeenCalledTimes(1);
			expect(promptMock.mock.calls[0]![0]).toMatchObject({
				path: { id: 'session-A' },
				body: { parts: [{ type: 'text', text: 'hello' }] }
			});
		});
	});
});
```

- [ ] **Step 2: Run the test**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/DecisionExecutor.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement opencode DecisionExecutor**

Create `packages/harness-kit/src/kernel/adapters/opencode/DecisionExecutor.ts`:

```ts
import type { createOpencodeClient } from '@opencode-ai/sdk';
import { Effect, Schema } from 'effect';

import { Decision } from '../../../Decision.ts';
import { SessionStateStore } from '../../../session-state/SessionStateStore.ts';

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
	Effect.gen(function* () {
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
					catch: (error) => error
				}).pipe(Effect.orElseSucceed(() => undefined));
			}
		}
	});
```

- [ ] **Step 4: Run the test**

```bash
bunx vitest run packages/harness-kit/test/opencode-adapters/DecisionExecutor.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Run full check + test**

```bash
bun run check && bun run test
```

Expected: PASS. Pi tests still untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/harness-kit/src/kernel/adapters/opencode/DecisionExecutor.ts packages/harness-kit/test/opencode-adapters/DecisionExecutor.test.ts
git commit -m "feat: add OpenCode DecisionExecutor adapter

Translates Decision values into OpenCode side effects:
- BlockToolCall reason extracted for the caller to throw
- InjectSystemPrompt content collected for output.system
- InjectUserMessage delivered via client.session.prompt
- AppendCustomEntry with skill-loaded customType writes to SessionStateStore"
```

---
## Phase 4: OpenCode hooks, layer factory, plugin entrypoint

Goal: the three OpenCode-flavored hooks under `harnesses/effect/src/hooks/opencode/`, the dual `EffectHarnessLayer.forPi` / `forOpenCode` factories, and the wired plugin entrypoint.

### Task 12: Extend SkillCatalog with a filesystem-glob rebuild factory

**Files:**
- Modify: `harnesses/effect/src/services/SkillCatalog.ts`

The existing `SkillCatalog.Interface.rebuild(commands, cwd)` takes Pi's command list. The OpenCode adapter doesn't have one; it needs to rebuild from a directory glob. Add a second method `rebuildFromDirectory(skillsDir)` alongside the existing one. The Pi `RebuildSkillCatalog` hook keeps calling `rebuild(commands, cwd)`; the OpenCode one will call `rebuildFromDirectory(skillsDir)`.

- [ ] **Step 1: Open the file**

Read `harnesses/effect/src/services/SkillCatalog.ts` to understand the current shape. The Interface currently exposes:

```ts
readonly rebuild: (commands, cwd) => Effect.Effect<void>;
readonly entries: Effect.Effect<ReadonlyArray<SkillIndexEntry.Value>>;
readonly normalizePath: (value, cwd) => Effect.Effect<string>;
readonly matchPath: (absPath) => Effect.Effect<Option.Option<SkillIndexEntry.Value>>;
```

- [ ] **Step 2: Add `rebuildFromDirectory` to the Interface**

Add to `Interface`:

```ts
readonly rebuildFromDirectory: (
	skillsDir: string
) => Effect.Effect<void>;
```

Keep the existing `rebuild` method. Both populate the same internal `entries` `Ref`.

- [ ] **Step 3: Implement `rebuildFromDirectory`**

Inside the `Layer.effect` body of `SkillCatalog.layer`, add a new function alongside the existing `rebuild`:

```ts
const rebuildFromDirectory = Effect.fn('SkillCatalog.rebuildFromDirectory')(
	function* (skillsDir: string) {
		const exists = yield* fileSystem.exists(skillsDir).pipe(
			Effect.orElseSucceed(() => false)
		);
		if (!exists) {
			yield* Ref.set(entries, []);
			return;
		}

		const dirEntries = yield* fileSystem.readDirectory(skillsDir).pipe(
			Effect.orElseSucceed(() => [] as readonly string[])
		);

		const resolvedEntries: Array<SkillIndexEntry.Value> = [];
		for (const childName of dirEntries) {
			if (!childName.startsWith('effect-')) {
				continue;
			}
			const skillDir = path.join(skillsDir, childName);
			const skillFilePath = path.join(skillDir, 'SKILL.md');
			const fileExists = yield* fileSystem.exists(skillFilePath).pipe(
				Effect.orElseSucceed(() => false)
			);
			if (!fileExists) {
				continue;
			}
			resolvedEntries.push(
				new SkillIndexEntry.Value({
					name: childName,
					skillFilePath,
					skillDir
				})
			);
		}

		yield* Ref.set(entries, sort(resolvedEntries, skillIndexEntryOrder));
	}
);
```

And include it in the returned `Service.of(...)`:

```ts
return Service.of({
	rebuild,
	rebuildFromDirectory,
	entries: Ref.get(entries),
	normalizePath: normalize,
	matchPath
});
```

- [ ] **Step 4: Run check + test**

```bash
bun run check && bun run test
```

Expected: PASS. Adding a method to the interface (with an implementation) shouldn't break any existing caller; the Pi adapter doesn't call the new method.

- [ ] **Step 5: Commit**

```bash
git add harnesses/effect/src/services/SkillCatalog.ts
git commit -m "feat: add SkillCatalog.rebuildFromDirectory for filesystem-glob rebuild

The Pi adapter rebuilds from pi.getCommands() via the existing .rebuild()
method. The OpenCode adapter has no command list to consume, so it walks
the skills directory directly. Both populate the same internal entries Ref."
```

### Task 13: OpenCode TrackSkillRead hook

**Files:**
- Create: `harnesses/effect/src/hooks/opencode/TrackSkillRead.ts`
- Create: `harnesses/effect/test/opencode-hooks/TrackSkillRead.test.ts` (optional unit test — kernel-level skill-gate test in Phase 5 already covers the happy path; skip if time-pressed)

The OpenCode `TrackSkillRead` differs from Pi's in one way: it handles both the `read` tool (path → skill matching) and the `skill` tool (`args.name` → skill name). Pi has no equivalent of the `skill` tool, so its TrackSkillRead is path-only.

- [ ] **Step 1: Create the file**

Create `harnesses/effect/src/hooks/opencode/TrackSkillRead.ts`:

```ts
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
		Effect.gen(function* () {
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
```

- [ ] **Step 2: Run check**

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add harnesses/effect/src/hooks/opencode/TrackSkillRead.ts
git commit -m "feat: add OpenCode TrackSkillRead hook

Tracks both the skill tool (by name) and the read tool (by path) for
pending-skill-read state. The Pi version stays put under hooks/pi/."
```

### Task 14: OpenCode EmitSkillLoadedEntry hook

**Files:**
- Create: `harnesses/effect/src/hooks/opencode/EmitSkillLoadedEntry.ts`

This is structurally similar to the Pi version (`hooks/pi/EmitSkillLoadedEntry.ts`): on tool result, if the pending read succeeded and isn't already loaded, emit a `Decision.AppendCustomEntry`. The OpenCode `DecisionExecutor` handles the actual side effect (writing to `SessionStateStore`).

Difference from Pi: the Pi version reads `input.input` for the read path (to attach to the entry's data). The OpenCode version doesn't need the path — the data only carries the skill name.

- [ ] **Step 1: Create the file**

Create `harnesses/effect/src/hooks/opencode/EmitSkillLoadedEntry.ts`:

```ts
import { Effect } from 'effect';

import { Decision } from 'pi-harness-kit/Decision.ts';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import { activeBranchLoadedEffectSkills } from '../../atoms/active-branch/activeBranchLoadedEffectSkills.ts';
import { SKILL_LOADED_ENTRY } from '../../constants.ts';
import type { PendingSkillReads } from '../../services/PendingSkillReads.ts';

const noDecisions = [] as const;

export const emitSkillLoadedEntryHook = (deps: {
	readonly pendingSkillReads: PendingSkillReads.Interface;
}): HarnessHook.OnToolResult => ({
	id: 'effect.opencode.emit-skill-loaded-entry.tool-result',
	phase: 'toolResult',
	run: (input) =>
		Effect.gen(function* () {
			const pendingSkill = yield* deps.pendingSkillReads.take(
				input.toolCallId
			);
			if (pendingSkill === undefined || input.isError) {
				return noDecisions;
			}
			if (
				activeBranchLoadedEffectSkills(input.activeBranch).has(
					pendingSkill
				)
			) {
				return noDecisions;
			}
			return [
				new Decision.AppendCustomEntry({
					customType: SKILL_LOADED_ENTRY,
					data: { name: pendingSkill }
				})
			];
		})
});
```

- [ ] **Step 2: Run check**

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add harnesses/effect/src/hooks/opencode/EmitSkillLoadedEntry.ts
git commit -m "feat: add OpenCode EmitSkillLoadedEntry hook

Emits Decision.AppendCustomEntry on a successful tracked skill read; the
OpenCode DecisionExecutor turns that into a SessionStateStore write.
Mirrors hooks/pi/EmitSkillLoadedEntry.ts but without the read-path field
in the custom-entry data."
```

### Task 15: OpenCode RebuildSkillCatalog hook

**Files:**
- Create: `harnesses/effect/src/hooks/opencode/RebuildSkillCatalog.ts`

- [ ] **Step 1: Create the file**

```ts
import { Effect } from 'effect';

import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { SkillCatalog } from '../../services/SkillCatalog.ts';

const noDecisions = [] as const;

const rebuild = (
	skillCatalog: SkillCatalog.Interface,
	skillsDir: string
) =>
	Effect.as(
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
```

- [ ] **Step 2: Run check**

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add harnesses/effect/src/hooks/opencode/RebuildSkillCatalog.ts
git commit -m "feat: add OpenCode RebuildSkillCatalog hook

Calls SkillCatalog.rebuildFromDirectory(skillsDir) on session-start and
session-tree. The Pi version (hooks/pi/RebuildSkillCatalog.ts) calls
.rebuild(commands, cwd) instead and is unchanged."
```

### Task 16: Add `forOpenCode` factory to EffectHarnessLayer

**Files:**
- Modify: `harnesses/effect/src/layers/EffectHarnessLayer.ts`

The current `EffectHarnessLayer.layer` builds the Pi adapter wiring. We refactor it into a namespace with two factory functions: `forPi(config)` (existing behavior, mostly unchanged) and `forOpenCode(config)` (new).

- [ ] **Step 1: Read the current file**

Read `harnesses/effect/src/layers/EffectHarnessLayer.ts`. Note: it currently uses `GitBranch.layer`, `ModePersistence.layer` (Pi version), and imports the Pi hooks (now from `hooks/pi/`).

- [ ] **Step 2: Refactor to a namespace with two factories**

Replace the contents of `harnesses/effect/src/layers/EffectHarnessLayer.ts`:

```ts
import * as NodeChildProcessSpawner from '@effect/platform-node/NodeChildProcessSpawner';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import * as NodePath from '@effect/platform-node/NodePath';
import { Effect, Layer, Path } from 'effect';
import type { HarnessHook } from 'pi-harness-kit/kernel/HarnessHook.ts';
import type { HarnessRule } from 'pi-harness-kit/kernel/HarnessRule.ts';
import { KernelLayer } from 'pi-harness-kit/kernel/layers/KernelLayer.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { HookSet } from 'pi-harness-kit/kernel/services/HookSet.ts';
import { PatternCatalog } from 'pi-harness-kit/kernel/services/PatternCatalog.ts';
import { PatternMatcher } from 'pi-harness-kit/kernel/services/PatternMatcher.ts';
import { RuleEngine } from 'pi-harness-kit/kernel/services/RuleEngine.ts';
import { RuleSet } from 'pi-harness-kit/kernel/services/RuleSet.ts';
import { WriteProjection } from 'pi-harness-kit/kernel/services/WriteProjection.ts';
import { GitBranch } from 'pi-harness-kit/mode/pi/GitBranch.ts';
import { ModePersistence } from 'pi-harness-kit/mode/pi/ModePersistence.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import { OpenCodeModePersistence } from 'pi-harness-kit/mode/opencode/ModePersistence.ts';
import { SessionStateStore } from 'pi-harness-kit/session-state/SessionStateStore.ts';

import { clearPendingSkillReadsHooks } from '../hooks/ClearPendingSkillReads.ts';
import { ensureReferenceCloneHooks } from '../hooks/EnsureReferenceClone.ts';
import { emitSkillLoadedEntryHook as piEmitSkillLoadedEntryHook } from '../hooks/pi/EmitSkillLoadedEntry.ts';
import { rebuildSkillCatalogHooks as piRebuildSkillCatalogHooks } from '../hooks/pi/RebuildSkillCatalog.ts';
import { trackSkillReadHook as piTrackSkillReadHook } from '../hooks/pi/TrackSkillRead.ts';
import { emitSkillLoadedEntryHook as ocEmitSkillLoadedEntryHook } from '../hooks/opencode/EmitSkillLoadedEntry.ts';
import { rebuildSkillCatalogHooks as ocRebuildSkillCatalogHooks } from '../hooks/opencode/RebuildSkillCatalog.ts';
import { trackSkillReadHook as ocTrackSkillReadHook } from '../hooks/opencode/TrackSkillRead.ts';
import { injectEffectPolicyHeaderRule } from '../rules/InjectEffectPolicyHeader.ts';
import { requireLoadedSkillsForEffectWritesRule } from '../rules/RequireLoadedSkillsForEffectWrites.ts';
import { sendPatternFeedbackAfterWriteRule } from '../rules/SendPatternFeedbackAfterWrite.ts';
import { GuidanceCatalog } from '../services/GuidanceCatalog.ts';
import { PendingSkillReads } from '../services/PendingSkillReads.ts';
import { ReferenceClone } from '../services/ReferenceClone.ts';
import { SkillCatalog } from '../services/SkillCatalog.ts';

export namespace EffectHarnessLayer {
	export interface PiConfig {
		readonly patternsDir: string;
		readonly guidanceDir: string;
	}

	export interface OpenCodeConfig {
		readonly patternsDir: string;
		readonly guidanceDir: string;
		readonly skillsDir: string;
		readonly cacheRootDir: string;
	}

	const nodePlatformLayer = NodeChildProcessSpawner.layer.pipe(
		Layer.provideMerge(
			Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
		)
	);

	/**
	 * Build the layer for the Pi extension host.
	 *
	 * Mirrors the upstream EffectHarnessLayer.layer behavior. Uses Pi's
	 * branch-aware ModePersistence and Pi-coupled hooks.
	 */
	export const forPi = (config: PiConfig) => {
		const kernelLayer = KernelLayer.layer(config.patternsDir).pipe(
			Layer.provide(nodePlatformLayer)
		);

		const guidanceCatalogLayer = GuidanceCatalog.layer(
			config.guidanceDir
		).pipe(Layer.provide(nodePlatformLayer));

		const gitBranchLayer = GitBranch.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const modePersistenceLayer = ModePersistence.layer.pipe(
			Layer.provide(
				Layer.mergeAll(nodePlatformLayer, gitBranchLayer)
			)
		);

		const skillCatalogLayer = SkillCatalog.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const baseLayer = Layer.mergeAll(
			kernelLayer,
			PendingSkillReads.layer,
			gitBranchLayer,
			guidanceCatalogLayer,
			modePersistenceLayer,
			ModeState.layer,
			ReferenceClone.layer,
			skillCatalogLayer
		);

		const effectRuleSetLayer = Layer.effect(
			RuleSet.Service,
			Effect.gen(function* () {
				const guidanceCatalog = yield* GuidanceCatalog.Service;
				const modeState = yield* ModeState.Service;
				const patternCatalog = yield* PatternCatalog.Service;
				const patternMatcher = yield* PatternMatcher.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const writeProjection = yield* WriteProjection.Service;

				const rules: ReadonlyArray<HarnessRule.Any> = [
					injectEffectPolicyHeaderRule({ guidanceCatalog }),
					requireLoadedSkillsForEffectWritesRule({
						guidanceCatalog,
						pendingSkillReads,
						writeProjection
					}),
					sendPatternFeedbackAfterWriteRule({
						guidanceCatalog,
						patternCatalog,
						patternMatcher,
						writeProjection
					})
				];

				return RuleSet.Service.of({
					all: Effect.gen(function* () {
						const enabled = yield* modeState.isEnabled;
						return enabled ? rules : [];
					})
				});
			})
		).pipe(Layer.provide(baseLayer));

		const effectHookSetLayer = HookSet.fromEffect(
			Effect.gen(function* () {
				const modeState = yield* ModeState.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const skillCatalog = yield* SkillCatalog.Service;

				const hooks: ReadonlyArray<HarnessHook.Any> = [
					...clearPendingSkillReadsHooks({ pendingSkillReads }),
					...piRebuildSkillCatalogHooks({ skillCatalog }),
					...ensureReferenceCloneHooks({
						modeState,
						referenceClone
					}),
					piTrackSkillReadHook({
						pendingSkillReads,
						skillCatalog
					}),
					piEmitSkillLoadedEntryHook({
						pendingSkillReads,
						skillCatalog
					})
				];
				return hooks;
			})
		).pipe(Layer.provide(baseLayer));

		const ruleEngineLayer = RuleEngine.layer.pipe(
			Layer.provideMerge(Layer.mergeAll(baseLayer, effectRuleSetLayer))
		);

		const harnessControllerLayer = HarnessController.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(
					baseLayer,
					effectHookSetLayer,
					ruleEngineLayer
				)
			)
		);

		return Layer.mergeAll(
			baseLayer,
			effectRuleSetLayer,
			effectHookSetLayer,
			ruleEngineLayer,
			harnessControllerLayer
		);
	};

	/**
	 * Build the layer for the OpenCode plugin host.
	 *
	 * Uses OpenCode-flavored ModePersistence (project-scoped, fixed cache dir),
	 * SessionStateStore for skill-load tracking, and the opencode/ hooks.
	 */
	export const forOpenCode = (config: OpenCodeConfig) => {
		const kernelLayer = KernelLayer.layer(config.patternsDir).pipe(
			Layer.provide(nodePlatformLayer)
		);

		const guidanceCatalogLayer = GuidanceCatalog.layer(
			config.guidanceDir
		).pipe(Layer.provide(nodePlatformLayer));

		const ocModePersistenceLayer = OpenCodeModePersistence.layer(
			config.cacheRootDir
		).pipe(Layer.provide(nodePlatformLayer));

		const sessionStateStoreLayer = SessionStateStore.layer(
			config.cacheRootDir
		).pipe(Layer.provide(nodePlatformLayer));

		const skillCatalogLayer = SkillCatalog.layer.pipe(
			Layer.provide(nodePlatformLayer)
		);

		const baseLayer = Layer.mergeAll(
			kernelLayer,
			PendingSkillReads.layer,
			guidanceCatalogLayer,
			ocModePersistenceLayer,
			ModeState.layer,
			ReferenceClone.layer,
			skillCatalogLayer,
			sessionStateStoreLayer
		);

		const effectRuleSetLayer = Layer.effect(
			RuleSet.Service,
			Effect.gen(function* () {
				const guidanceCatalog = yield* GuidanceCatalog.Service;
				const modeState = yield* ModeState.Service;
				const patternCatalog = yield* PatternCatalog.Service;
				const patternMatcher = yield* PatternMatcher.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const writeProjection = yield* WriteProjection.Service;

				const rules: ReadonlyArray<HarnessRule.Any> = [
					injectEffectPolicyHeaderRule({ guidanceCatalog }),
					requireLoadedSkillsForEffectWritesRule({
						guidanceCatalog,
						pendingSkillReads,
						writeProjection
					}),
					sendPatternFeedbackAfterWriteRule({
						guidanceCatalog,
						patternCatalog,
						patternMatcher,
						writeProjection
					})
				];

				return RuleSet.Service.of({
					all: Effect.gen(function* () {
						const enabled = yield* modeState.isEnabled;
						return enabled ? rules : [];
					})
				});
			})
		).pipe(Layer.provide(baseLayer));

		const effectHookSetLayer = HookSet.fromEffect(
			Effect.gen(function* () {
				const modeState = yield* ModeState.Service;
				const pendingSkillReads = yield* PendingSkillReads.Service;
				const referenceClone = yield* ReferenceClone.Service;
				const skillCatalog = yield* SkillCatalog.Service;

				const hooks: ReadonlyArray<HarnessHook.Any> = [
					...clearPendingSkillReadsHooks({ pendingSkillReads }),
					...ocRebuildSkillCatalogHooks({
						skillCatalog,
						skillsDir: config.skillsDir
					}),
					...ensureReferenceCloneHooks({
						modeState,
						referenceClone
					}),
					ocTrackSkillReadHook({
						pendingSkillReads,
						skillCatalog
					}),
					ocEmitSkillLoadedEntryHook({ pendingSkillReads })
				];
				return hooks;
			})
		).pipe(Layer.provide(baseLayer));

		const ruleEngineLayer = RuleEngine.layer.pipe(
			Layer.provideMerge(Layer.mergeAll(baseLayer, effectRuleSetLayer))
		);

		const harnessControllerLayer = HarnessController.layer.pipe(
			Layer.provideMerge(
				Layer.mergeAll(
					baseLayer,
					effectHookSetLayer,
					ruleEngineLayer
				)
			)
		);

		return Layer.mergeAll(
			baseLayer,
			effectRuleSetLayer,
			effectHookSetLayer,
			ruleEngineLayer,
			harnessControllerLayer
		);
	};
}
```

- [ ] **Step 3: Update the Pi entrypoint to use the new factory name**

Open `harnesses/effect/src/index.ts`. Find the line that calls `EffectHarnessLayer.layer` (or similar). Change to `EffectHarnessLayer.forPi(...)`. The config shape it accepts may differ; check signatures and adjust.

If the Pi entrypoint was relying on the previous bare-`layer` export, you might need to thread `patternsDir` and `guidanceDir` through differently. Look at how `import.meta.dirname` was computed (lines 39 in the upstream EffectHarnessLayer.ts: `packageRootSegments`). Reproduce that logic in `index.ts` or wherever the Pi entry is.

- [ ] **Step 4: Run check + test**

```bash
bun run check && bun run test
```

Expected: PASS. Both adapter layers compile; Pi tests still pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: split EffectHarnessLayer into forPi and forOpenCode factories

forPi preserves the existing Pi-side behavior bit-for-bit. forOpenCode is
the new factory for the OpenCode adapter — uses OpenCodeModePersistence,
SessionStateStore, and the opencode/ hooks. Both share the same base
layer (kernel, guidance, pattern catalog, mode state, reference clone,
skill catalog, pending skill reads)."
```

### Task 17: Wire the OpenCode plugin entrypoint

**Files:**
- Modify: `opencode/plugin.ts`
- Create: `commands/toggle-effect-harness.md`

- [ ] **Step 1: Create the toggle command file**

Create `commands/toggle-effect-harness.md`:

```markdown
---
description: Toggle the opencode-effect-harness Effect v4 mode (skill gating, policy header, pattern feedback)
---

(This command is handled by the opencode-effect-harness plugin via command.execute.before. The body is intentionally a no-op; the plugin intercepts and short-circuits before any LLM call.)
```

- [ ] **Step 2: Rewrite plugin.ts with the full wiring**

Replace `opencode/plugin.ts`:

```ts
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from '@opencode-ai/plugin';
import { Effect, ManagedRuntime } from 'effect';

import {
	collectSystemPromptAdditions,
	executeSideEffects,
	findBlockReason
} from 'pi-harness-kit/kernel/adapters/opencode/DecisionExecutor.ts';
import { activeBranchForSession } from 'pi-harness-kit/kernel/adapters/opencode/BeforeAgentStartSnapshot.ts';
import {
	writeIntentFromToolExecuteAfter,
	writeIntentFromToolExecuteBefore
} from 'pi-harness-kit/kernel/adapters/opencode/ToolEventSnapshot.ts';
import { HarnessController } from 'pi-harness-kit/kernel/services/HarnessController.ts';
import { ModeState } from 'pi-harness-kit/mode/ModeState.ts';
import { OpenCodeModePersistence } from 'pi-harness-kit/mode/opencode/ModePersistence.ts';
import { SessionStateStore } from 'pi-harness-kit/session-state/SessionStateStore.ts';

import { EffectHarnessLayer } from 'pi-effect-harness/layers/EffectHarnessLayer.ts';

const pluginRoot = dirname(fileURLToPath(import.meta.url));
// In the source tree, plugin.ts is at /opencode/plugin.ts.
// The shared content (patterns, guidance, skills) lives at
// /harnesses/effect/{patterns,guidance,skills}/.
// In the published tarball, the layout collapses to /dist/plugin.js with
// /skills, /patterns, /guidance, /commands at the root. The build script
// places these paths so that one ../<dir> walk from the plugin's own
// location reaches them in both layouts.
const patternsDir = join(pluginRoot, '..', 'harnesses', 'effect', 'patterns');
const guidanceDir = join(pluginRoot, '..', 'harnesses', 'effect', 'guidance');
const skillsDir = join(pluginRoot, '..', 'harnesses', 'effect', 'skills');

const cacheRootDir = join(homedir(), '.cache', 'opencode-effect-harness');

const TOGGLE_COMMAND_NAME = 'toggle-effect-harness';

const effectHarnessPlugin: Plugin = async ({ client, project }) => {
	const runtime = ManagedRuntime.make(
		EffectHarnessLayer.forOpenCode({
			patternsDir,
			guidanceDir,
			skillsDir,
			cacheRootDir
		})
	);
	type RuntimeServices = ManagedRuntime.ManagedRuntime.Services<
		typeof runtime
	>;
	const run = <A, E, R extends RuntimeServices>(
		effect: Effect.Effect<A, E, R>
	) => runtime.runPromise(effect);

	const projectId = project.id;
	const cwd = project.worktree ?? project.directory ?? process.cwd();

	// Restore mode state on startup. Default: enabled.
	const restored = await run(
		Effect.flatMap(OpenCodeModePersistence.Service, (p) => p.load(projectId))
	);
	const initialEnabled = restored ?? true;
	await run(
		Effect.flatMap(ModeState.Service, (s) => s.setEnabled(initialEnabled))
	);

	return {
		config: async (input) => {
			const cfg = input as typeof input & {
				skills?: { paths?: string[]; urls?: string[] };
			};
			cfg.skills ??= {};
			cfg.skills.paths ??= [];
			if (!cfg.skills.paths.includes(skillsDir)) {
				cfg.skills.paths.push(skillsDir);
			}
		},

		'experimental.chat.system.transform': async (input, output) => {
			const enabled = await run(
				Effect.flatMap(ModeState.Service, (s) => s.isEnabled)
			);
			if (!enabled) {
				return;
			}
			const sessionId = input.sessionID ?? 'unknown';
			const decisions = await run(
				Effect.gen(function* () {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(sessionId);
					return yield* controller.onBeforeAgentStart({
						activeBranch,
						cwd
					});
				})
			);
			for (const addition of collectSystemPromptAdditions(decisions)) {
				output.system.push(addition);
			}
		},

		'tool.execute.before': async (input, output) => {
			const enabled = await run(
				Effect.flatMap(ModeState.Service, (s) => s.isEnabled)
			);
			if (!enabled) {
				return;
			}

			const writeIntent = writeIntentFromToolExecuteBefore(input, output);

			const decisions = await run(
				Effect.gen(function* () {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(
						input.sessionID
					);
					return yield* controller.onToolCall({
						activeBranch,
						cwd,
						input: output.args,
						toolCallId: input.callID,
						toolName: input.tool,
						writeIntent
					});
				})
			);

			const blockReason = findBlockReason(decisions);
			if (blockReason !== undefined) {
				throw new Error(blockReason);
			}
		},

		'tool.execute.after': async (input, output) => {
			const enabled = await run(
				Effect.flatMap(ModeState.Service, (s) => s.isEnabled)
			);
			if (!enabled) {
				return;
			}

			const writeIntent = writeIntentFromToolExecuteAfter(input);

			const decisions = await run(
				Effect.gen(function* () {
					const controller = yield* HarnessController.Service;
					const activeBranch = yield* activeBranchForSession(
						input.sessionID
					);
					return yield* controller.onToolResult({
						activeBranch,
						cwd,
						input: input.args,
						isError: false,
						toolCallId: input.callID,
						toolName: input.tool,
						writeIntent
					});
				})
			);

			await run(
				executeSideEffects({
					client,
					sessionId: input.sessionID,
					decisions
				})
			);
		},

		'command.execute.before': async (input) => {
			if (input.command !== TOGGLE_COMMAND_NAME) {
				return;
			}

			const next = await run(
				Effect.gen(function* () {
					const state = yield* ModeState.Service;
					const persistence = yield* OpenCodeModePersistence.Service;
					const wasEnabled = yield* state.isEnabled;
					const nowEnabled = !wasEnabled;
					yield* state.setEnabled(nowEnabled);
					yield* persistence.save(projectId, nowEnabled);
					return nowEnabled;
				})
			);

			// Best-effort toast.
			await (client as any).event
				?.publish?.({
					body: {
						type: 'tui.toast.show',
						properties: {
							message: next
								? 'Effect harness mode enabled'
								: 'Effect harness mode disabled',
							variant: 'info'
						}
					}
				})
				.catch(() => undefined);

			throw new Error(
				'Command handled by opencode-effect-harness plugin'
			);
		},

		event: async ({ event }) => {
			if (event.type === 'session.created') {
				await run(
					Effect.flatMap(HarnessController.Service, (controller) =>
						controller.onSessionStart({
							commands: [],
							cwd
						})
					)
				);
				return;
			}
			if (event.type === 'session.compacted') {
				const sessionId = event.properties.sessionID;
				await run(
					Effect.flatMap(SessionStateStore.Service, (store) =>
						store.clearSession(sessionId)
					)
				);
				return;
			}
		}
	};
};

export default effectHarnessPlugin;
```

- [ ] **Step 3: Run check + test**

```bash
bun run check && bun run test
```

Expected: PASS. The Pi adapter tests still pass; the OpenCode entrypoint typechecks.

- [ ] **Step 4: Commit**

```bash
git add opencode/plugin.ts commands/toggle-effect-harness.md
git commit -m "feat: wire up the OpenCode plugin entrypoint

Hooks: config (skills.paths registration), experimental.chat.system.transform,
tool.execute.before (block + skill-read track), tool.execute.after
(skill-load confirm + pattern feedback), command.execute.before (toggle),
event (session.created rebuild + session.compacted state clear). Mode
defaults to enabled on first install; persists per project."
```

### Task 18: Smoke-test the wired OpenCode plugin

**Files:** none in this repo.

- [ ] **Step 1: Set up a scratch project**

```bash
cd /tmp && rm -rf opencode-harness-smoke && mkdir opencode-harness-smoke && cd opencode-harness-smoke
cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["$HOME/Development/pi-effect-harness-fork/opencode/plugin.ts"]
}
EOF
```

- [ ] **Step 2: Start OpenCode interactively and verify**

```bash
opencode
```

Inside the session:
1. Try invoking a skill: `skill({ name: "effect-error-handling" })` (the agent can be told to do this). Verify the skill body loads.
2. Ask the model to write a small Effect file. Expected: write is **blocked** with a message about the 7-skill threshold.
3. Have the model load 7 effect-* skills. Retry the write. Expected: succeeds.
4. Get the model to write code that triggers a known pattern (e.g., `JSON.parse`). Expected: pattern feedback appears as a user-side turn.
5. Run `/toggle-effect-harness`. Expected: harness disables, write proceeds without gate. Toggle again to re-enable. Restart OpenCode; verify state persisted.

If anything fails, debug and commit fixes:

```bash
cd ~/Development/pi-effect-harness-fork
# fix something
git add -A
git commit -m "fix: smoke-test correction"
```

- [ ] **Step 3: Verify the Pi adapter still works**

Critical check: the Pi adapter must also still function. Pull out the upstream Pi test process:

```bash
bun run test   # includes the full Pi-adapter test suite
```

Expected: PASS. If anything broke, the parallel-adapter approach has regressed the Pi side; fix before continuing.

---
## Phase 5: Build, docs, and PR

Goal: dual-tarball build, documentation that explains both plugins, and a PR open against upstream.

### Task 19: Split the build-publishable script

**Files:**
- Modify: `scripts/build-publishable.ts` (becomes a dispatcher)
- Create: `scripts/build-publishable-pi.ts` (Pi-specific build — extracted from upstream's existing script)
- Create: `scripts/build-publishable-opencode.ts` (new)
- Modify: root `package.json` `scripts`

- [ ] **Step 1: Read upstream's existing script**

```bash
cat scripts/build-publishable.ts
```

This is the Pi-specific build. Note what it does:
- Cleans a dist directory
- Compiles TypeScript
- Copies skills/patterns/guidance into the dist
- Writes a `package.json` with `pi-effect-harness` metadata, `catalog:`-substituted versions, no workspace references

- [ ] **Step 2: Extract it to `scripts/build-publishable-pi.ts`**

```bash
git mv scripts/build-publishable.ts scripts/build-publishable-pi.ts
```

(No content change yet.)

- [ ] **Step 3: Write the OpenCode build script**

Create `scripts/build-publishable-opencode.ts`. The structure mirrors the Pi script, but produces:

- Output dir: `harnesses/opencode-effect/dist/`
- Entry: `opencode/plugin.ts` bundled to `dist/plugin.js`
- Bundle externals: `effect`, `@effect/platform-node`, `@opencode-ai/plugin`
- Copies into the tarball root:
  - `skills/` ← from `harnesses/effect/skills/`
  - `patterns/` ← from `harnesses/effect/patterns/`
  - `guidance/` ← from `harnesses/effect/guidance/`
  - `commands/toggle-effect-harness.md`
  - `README.md` ← from `harnesses/opencode-effect/README.md`
  - `LICENSE` ← root LICENSE
- Writes a `package.json` based on `harnesses/opencode-effect/package.json` but with all `catalog:` and `workspace:*` references resolved

Reference the upstream Pi build script for the exact mechanics (Bun's bundler API, dependency-version resolution, etc.). The intent of "produce one valid npm tarball" is identical between the two scripts; only the source paths and output path differ.

A skeletal version:

```ts
#!/usr/bin/env bun

import { $ } from 'bun';
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'harnesses', 'opencode-effect', 'dist');
const HARNESS = join(ROOT, 'harnesses', 'effect');
const COMMANDS = join(ROOT, 'commands');
const OPENCODE_DIR = join(ROOT, 'opencode');

const rootPkg = JSON.parse(
	readFileSync(join(ROOT, 'package.json'), 'utf8')
) as {
	catalog: Record<string, string>;
};
const ocPkg = JSON.parse(
	readFileSync(join(ROOT, 'harnesses', 'opencode-effect', 'package.json'), 'utf8')
) as { version: string };

console.log('Cleaning dist...');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log('Bundling plugin entrypoint...');
await $`bun build ${join(OPENCODE_DIR, 'plugin.ts')} --target=bun --format=esm --outdir=${DIST} --external=effect --external=@effect/platform-node --external=@opencode-ai/plugin --external=@opencode-ai/sdk`.quiet();

console.log('Generating .d.ts...');
// If you have tsgo --emitDeclarationOnly, run it here against opencode/plugin.ts.
// Skip if d.ts generation isn't required for OpenCode plugin loading (it isn't,
// since plugins are loaded via dynamic import; users don't import types from them).

console.log('Copying static content...');
cpSync(join(HARNESS, 'skills'), join(DIST, 'skills'), { recursive: true });
cpSync(join(HARNESS, 'patterns'), join(DIST, 'patterns'), { recursive: true });
cpSync(join(HARNESS, 'guidance'), join(DIST, 'guidance'), { recursive: true });
mkdirSync(join(DIST, 'commands'), { recursive: true });
cpSync(join(COMMANDS, 'toggle-effect-harness.md'), join(DIST, 'commands', 'toggle-effect-harness.md'));
cpSync(join(ROOT, 'harnesses', 'opencode-effect', 'README.md'), join(DIST, 'README.md'));
cpSync(join(ROOT, 'LICENSE'), join(DIST, 'LICENSE'));

console.log('Writing package.json...');
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
	main: './plugin.js',
	exports: { '.': './plugin.js' },
	files: [
		'plugin.js',
		'plugin.js.map',
		'skills',
		'patterns',
		'guidance',
		'commands',
		'README.md',
		'LICENSE'
	],
	dependencies: {
		'@effect/platform-node': rootPkg.catalog['@effect/platform-node'],
		effect: rootPkg.catalog.effect
	},
	peerDependencies: {
		'@opencode-ai/plugin': '^1.15.0'
	}
};
writeFileSync(
	join(DIST, 'package.json'),
	JSON.stringify(publishedPackageJson, null, 2)
);

console.log('Done. Tarball ready in', DIST);
```

(Trim or extend per upstream's conventions.)

- [ ] **Step 4: Replace `scripts/build-publishable.ts` with a dispatcher**

Create new `scripts/build-publishable.ts`:

```ts
#!/usr/bin/env bun

const target = process.argv[2];

if (target === 'pi' || target === undefined) {
	await import('./build-publishable-pi.ts');
}

if (target === 'opencode' || target === 'all' || (target === undefined && process.env.PUBLISH_OPENCODE === '1')) {
	await import('./build-publishable-opencode.ts');
}

if (target !== undefined && !['pi', 'opencode', 'all'].includes(target)) {
	console.error(`Unknown target: ${target}. Expected one of: pi, opencode, all.`);
	process.exit(1);
}
```

- [ ] **Step 5: Update root `package.json` scripts**

```jsonc
"scripts": {
  "fmt": "dprint fmt",
  "fmt:check": "dprint check",
  "lint": "oxlint -c oxlintrc.json",
  "test": "vitest run",
  "typecheck": "tsgo",
  "check": "dprint fmt && oxlint -c oxlintrc.json && tsgo",
  "build:publishable": "bun run scripts/build-publishable.ts pi",
  "build:publishable:opencode": "bun run scripts/build-publishable.ts opencode",
  "build:publishable:all": "bun run scripts/build-publishable.ts all",
  "publish:dry": "bun run scripts/build-publishable.ts pi && cd harnesses/effect/dist && bun publish --dry-run",
  "publish:opencode:dry": "bun run scripts/build-publishable.ts opencode && cd harnesses/opencode-effect/dist && bun publish --dry-run",
  "prepare": "effect-tsgo patch"
}
```

- [ ] **Step 6: Run both builds**

```bash
bun run build:publishable
bun run build:publishable:opencode
```

Expected: both succeed. `harnesses/effect/dist/` contains the Pi tarball-ready output; `harnesses/opencode-effect/dist/` contains the OpenCode one. Inspect:

```bash
ls harnesses/effect/dist/
ls harnesses/opencode-effect/dist/
```

- [ ] **Step 7: Pack-test both**

```bash
cd harnesses/effect/dist && bun pm pack && ls *.tgz
cd ../../opencode-effect/dist && bun pm pack && ls *.tgz
cd ../../..
```

Expected: each dist produces a tarball.

- [ ] **Step 8: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: split build-publishable into pi and opencode targets

scripts/build-publishable.ts becomes a dispatcher; the Pi-specific build
moves to scripts/build-publishable-pi.ts unchanged; a new
scripts/build-publishable-opencode.ts produces the OpenCode tarball.
Root scripts: build:publishable (default pi), build:publishable:opencode,
build:publishable:all."
```

### Task 20: Add OpenCode docs

**Files:**
- Modify: `README.md` (top-level — add a note about the two plugins)
- Modify: `harnesses/opencode-effect/README.md` (full OpenCode-flavored docs)
- Modify: `AGENTS.md` (small update describing the parallel adapter layout)

The Pi-flavored upstream README stays as-is. We add a paragraph near the top noting that there's also an OpenCode adapter, and point at `harnesses/opencode-effect/README.md` for OpenCode-specific install + usage.

- [ ] **Step 1: Add a multi-host note to the top-level README**

Open `README.md`. After the table of contents (or in a new "Hosts" section near the top), add:

```markdown
## Hosts

This workspace publishes two plugins from the same source:

- **`pi-effect-harness`** — the original [Pi coding agent](https://pi.dev) extension. Documented in the rest of this README.
- **`opencode-effect-harness`** — a sibling [OpenCode](https://opencode.ai) plugin that shares the same skills, patterns, guidance, and kernel. Documented separately in [`harnesses/opencode-effect/README.md`](harnesses/opencode-effect/README.md).

The two adapters live side-by-side in `packages/harness-kit/src/kernel/adapters/{pi,opencode}/` and `harnesses/effect/src/hooks/{pi,opencode}/`. Skills, patterns, guidance, the kernel itself, and the three host-agnostic rules are shared.
```

- [ ] **Step 2: Write the OpenCode README**

Replace `harnesses/opencode-effect/README.md` (currently a single-line stub from Task 6). Use the same structure as the upstream Pi README, but rewritten for OpenCode. Cover:

- What it does (the four behaviors: skill gate, policy header, pattern feedback, reference clone)
- Install (`opencode.json` plugin entry; per-project vs global)
- Usage (`/toggle-effect-harness`, no badge but a toast on toggle)
- How it works (lifecycle diagram for OpenCode hooks: `experimental.chat.system.transform`, `tool.execute.before/after`, `command.execute.before`, `event` for session.created/compacted)
- Skill catalog table (reference upstream's structure)
- Pattern catalog table (reference upstream's structure)
- Configuration (mostly nothing user-configurable; `cacheRootDir` is conceptually configurable but not currently exposed)
- Caveats
- Development (mention `bun run build:publishable:opencode`)

Important differences from the upstream README:

- No gold status badge
- `/toggle-effect-harness` instead of mode-toggler UI
- Default-enabled on install
- `~/.cache/opencode-effect-harness/projects/<projectID>/mode.json` instead of Pi's session state
- Skill catalog rebuilt from `harnesses/effect/skills/` via the `config` hook registering `skills.paths`

This is the biggest content task in the plan. Plan on ~45 minutes of careful writing.

- [ ] **Step 3: Update AGENTS.md**

Open `AGENTS.md`. Add a section near the top of the layout description:

```markdown
This workspace now ships two host adapters from a shared core. See `harnesses/opencode-effect/README.md` for the OpenCode-flavored docs and `README.md` for the Pi-flavored docs. The kernel, rules, atoms, skills, patterns, and guidance are shared. The split is at:

- `packages/harness-kit/src/kernel/adapters/{pi,opencode}/`
- `packages/harness-kit/src/mode/{pi,opencode}/` (ModeState.ts stays at `mode/` top level — shared)
- `packages/harness-kit/src/session-state/` (shared service consumed by the OpenCode adapter)
- `harnesses/effect/src/hooks/{pi,opencode}/`
- `harnesses/effect/src/index.ts` (Pi entry) vs `opencode/plugin.ts` (OpenCode entry)
- `harnesses/effect/package.json` (`pi-effect-harness`) vs `harnesses/opencode-effect/package.json` (`opencode-effect-harness`)
```

Update the "Where to look for common changes" table to mention both hosts for relevant rows.

- [ ] **Step 4: Verify**

```bash
rg -i "opencode" README.md AGENTS.md harnesses/opencode-effect/README.md
```

Expected: appropriate matches in each.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md harnesses/opencode-effect/README.md
git commit -m "docs: add OpenCode-flavored README and update workspace docs"
```

### Task 21: Final QA against a real Effect project

**Files:** none in this repo.

Same shape as Task 18, but more thorough. Pick a real Effect v4 project you actually use.

- [ ] **Step 1: Install the OpenCode plugin (packed version)**

```bash
cd your-effect-project
mkdir -p .opencode
cd .opencode
bun add ~/Development/pi-effect-harness-fork/harnesses/opencode-effect/dist/opencode-effect-harness-0.1.0.tgz
cd ..
```

Update `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-effect-harness"]
}
```

- [ ] **Step 2: Verify every feature**

(Same checklist as the previous plan's Task 22 — confirm policy header injection, skill catalog visibility, skill gate firing, gate clearing on 7 loads, pattern feedback fire, reference clone present, toggle works, persistence works, session.compacted resets skill counts.)

- [ ] **Step 3: Verify the Pi adapter also still works (where possible)**

If you have a Pi project handy, install the Pi build and confirm it works identically to before the fork started. If not, this gets verified during upstream PR review (or after, if upstream merges).

- [ ] **Step 4: File issues for failures**

GitHub issues for anything broken. Fix critical ones now; defer cosmetic.

- [ ] **Step 5: Commit any fixes**

```bash
cd ~/Development/pi-effect-harness-fork
git status
# if anything changed:
git add -A && git commit -m "fix: QA cycle fixes"
```

### Task 22: Push the working branch and open the upstream PR

**Files:** none.

- [ ] **Step 1: Push the working branch**

```bash
git push -u origin typedrat/opencode-adapter
```

- [ ] **Step 2: Open the PR against upstream**

```bash
gh pr create \
  --repo mpsuesser/pi-effect-harness \
  --base main \
  --head typedrat:typedrat/opencode-adapter \
  --title "feat: add OpenCode plugin adapter alongside the Pi extension" \
  --body "$(cat <<'EOF'
## Summary

This PR adds an **OpenCode plugin adapter** to the workspace, living alongside the existing Pi extension. Both plugins share the kernel, rules, atoms, skills, patterns, and guidance. The split is at the adapter and hook boundary:

- `packages/harness-kit/src/kernel/adapters/{pi,opencode}/`
- `harnesses/effect/src/hooks/{pi,opencode}/`
- `harnesses/effect/src/index.ts` (Pi) vs `opencode/plugin.ts` (OpenCode)
- A new sibling workspace package `harnesses/opencode-effect/` publishes the OpenCode plugin as `opencode-effect-harness`.

The Pi extension is unchanged in behavior; all existing tests pass, and I verified the smoke flow against a Pi project (see "Verification" below).

## Why

OpenCode and Pi have similar enough plugin surfaces that the kernel can power both. The marginal effort of supporting a second host is small relative to maintaining a fork separately. If you'd prefer not to host the OpenCode adapter, I'll publish `opencode-effect-harness` from `typedrat/pi-effect-harness` instead — no objections, just thought it was worth offering.

## Verification

- `bun run check && bun run test` passes (all 100+ existing tests + the new SessionStateStore, OpenCodeModePersistence, BranchSnapshot, ToolEventSnapshot, DecisionExecutor tests).
- Manual QA against [a real Effect v4 project] under OpenCode confirms: policy header injection, skill gate firing + clearing, pattern feedback delivery, reference clone refresh, toggle UX, session.compacted state reset.
- Pi adapter still loads and behaves identically (verified via the existing test suite; haven't end-to-end tested against a Pi instance — let me know if you'd like me to do that).

## Caveats

- Bumped Effect from beta.59 to beta.65 to match OpenCode's plugin host. Pi adapter tests still pass on this version; verified `@mariozechner/pi-coding-agent` is compatible.
- Repo name is still `pi-effect-harness`. Happy to discuss a rename if you'd prefer something more neutral.

## Spec and plan

For background, the spec is at `docs/specs/2026-05-15-opencode-effect-harness-cutover-design.md` and the implementation plan at `docs/plans/2026-05-15-opencode-effect-harness-cutover.md`. Both committed as part of this PR; happy to drop them if you'd rather not host the design artifacts in the repo.
EOF
)"
```

- [ ] **Step 3: Wait for review**

If `mpsuesser` engages, address feedback iteratively. If silence after a reasonable interval (~2 weeks), check in via a comment on the PR or a separate issue.

- [ ] **Step 4: If upstream merges, celebrate**

🎉 Single source of truth achieved. Delete the fork-only publishing infrastructure if any; the upstream will own publishing of `opencode-effect-harness`.

- [ ] **Step 5: If upstream declines or doesn't engage, publish from the fork**

```bash
cd ~/Development/pi-effect-harness-fork
bun run build:publishable:opencode
cd harnesses/opencode-effect/dist
bun publish --access public
```

Expected: `opencode-effect-harness@0.1.0` is published to npm under your account.

Test from a clean install:

```bash
cd /tmp && rm -rf published-test && mkdir published-test && cd published-test
cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-effect-harness"]
}
EOF
opencode --help 2>&1 | head -5
```

Expected: OpenCode auto-installs and loads the published plugin.

Tag the release on your fork:

```bash
cd ~/Development/pi-effect-harness-fork
git tag -a opencode-v0.1.0 -m "opencode-effect-harness v0.1.0 — initial release from fork"
git push origin opencode-v0.1.0
```

---

## Out of scope

These items came up during brainstorming and were decided against — documented here so they don't accidentally land in this plan:

- **Replicating Pi's gold status badge in the OpenCode adapter.** No OpenCode plugin-accessible mechanism. Toast on toggle is the consolation.
- **Branch-scoped skill-load state in the OpenCode adapter.** OpenCode doesn't expose Pi's session-branch model. We use session-scoped via `SessionStateStore`; `session.compacted` clears state to match upstream's "compact resets skills" UX.
- **Removing the Pi adapter.** Explicitly preserved.
- **Forking `mpsuesser/pi-effect-harness` to a new GitHub repo name.** Working on `typedrat/pi-effect-harness` keeping the name. If upstream merges, no rename happens. If publishing from the fork, the npm package name (`opencode-effect-harness`) is what users see; the repo name is invisible.
- **Stripping `effect-*` skills from the OpenCode `<available_skills>` block when toggle is OFF.** Server-side caching makes runtime rewriting fragile; skills stay discoverable when mode is OFF, only the harness behaviors disable.
- **Coordinating an upstream `pi-mono` Effect bump.** If Task 2 reveals an incompatibility, that becomes a separate workflow (file an issue against `pi-mono`); not in this plan.
- **Mutating the system prompt to add OpenCode-aware preview content beyond what the Pi adapter does.** Same content for both adapters; the policy header is shared.
