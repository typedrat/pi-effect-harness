# opencode-effect-harness — parallel adapter design

**Date**: 2026-05-15
**Status**: Approved, ready for implementation plan
**Upstream**: [`mpsuesser/pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness)
**Working fork**: `typedrat/pi-effect-harness` (rename pending — possibly to `pi-effect-harness` keeping the name, or to a more neutral one)

---

## Goal

Add a second host adapter — OpenCode — to the existing `pi-effect-harness` workspace, alongside the existing Pi adapter, so the same kernel, rules, atoms, skills, patterns, and guidance docs power two published plugins: `pi-effect-harness` and `opencode-effect-harness`. Work happens on `typedrat`'s fork; the finished work is offered upstream as a PR. If upstream merges, single source of truth. If upstream declines, publish from the fork.

## Why parallel adapter, not hard fork

Considered. The kernel (PatternMatcher, WriteProjection, Decision ADT, atoms, rules) is already host-agnostic in design — only the four adapter files in `packages/harness-kit/src/kernel/adapters/` and the three mode/session-state-coupled hooks in `harnesses/effect/src/hooks/` touch host APIs. The rest is reusable. The marginal effort to add a second host alongside the first is comparable to the effort to fork and rebrand (we save ~1 day of rebrand/cleanup work and spend ~½ day on dual exports and per-host hook subdirs). The big win is that content (41 skills, 46 patterns, 3 guidance docs) and kernel improvements flow freely between hosts forever.

Risk we accept: upstream review may add latency or reject the direction. Mitigation: build the parallel adapter on the fork first, test it end-to-end, then offer the working code as a PR. If upstream declines, publish `opencode-effect-harness` from the fork.

## Why not "just copy the content"

Considered and rejected. OpenCode's native skill discovery + AGENTS.md gets ~60% of the value (skills work, static policy header works) in one hour, but the pattern feedback loop is plugin-only and is the feature with the highest marginal value: it actively corrects the model at the keystroke rather than passively informing it via docs. Build the plugin.

## Architecture

### Source tree (target state)

```
pi-effect-harness/                                  # (repo name unchanged, or renamed if upstream chooses)
├── package.json                                    # workspaces: packages/*, harnesses/*; publish manifests live in sub-packages
├── opencode/                                       # NEW — top-level convention only; the file is the OpenCode plugin entrypoint
│   └── plugin.ts
├── commands/                                       # NEW
│   └── toggle-effect-harness.md                    # No-op markdown; plugin intercepts via command.execute.before
├── packages/
│   └── harness-kit/
│       ├── package.json                            # name unchanged: pi-harness-kit
│       └── src/
│           ├── Decision.ts                         # UNCHANGED (host-agnostic ADT)
│           ├── Pattern.ts                          # UNCHANGED
│           ├── WriteIntent.ts                      # UNCHANGED
│           ├── frontmatter.ts                      # UNCHANGED
│           ├── EditReplacement.ts                  # UNCHANGED
│           ├── SkillIndexEntry.ts                  # UNCHANGED
│           ├── ActiveBranch.ts                     # UNCHANGED
│           ├── UserMessage.ts                      # UNCHANGED
│           ├── Rule.ts                             # UNCHANGED
│           ├── constants.ts                        # UNCHANGED
│           ├── atoms/                              # UNCHANGED
│           ├── types/picomatch.d.ts                # UNCHANGED
│           ├── kernel/
│           │   ├── HarnessRule.ts                  # UNCHANGED
│           │   ├── HarnessHook.ts                  # UNCHANGED
│           │   ├── MatcherInput.ts                 # UNCHANGED
│           │   ├── path/normalizePath.ts           # UNCHANGED
│           │   ├── layers/KernelLayer.ts           # UNCHANGED
│           │   ├── services/                       # UNCHANGED
│           │   └── adapters/
│           │       ├── pi/                         # MOVED — existing Pi adapters relocated to subdir
│           │       │   ├── DecisionExecutor.ts
│           │       │   ├── ToolEventSnapshot.ts
│           │       │   ├── BeforeAgentStartSnapshot.ts
│           │       │   └── BranchSnapshot.ts
│           │       └── opencode/                   # NEW — OpenCode adapters
│           │           ├── DecisionExecutor.ts
│           │           ├── ToolEventSnapshot.ts
│           │           ├── BeforeAgentStartSnapshot.ts
│           │           └── BranchSnapshot.ts
│           ├── mode/
│           │   ├── ModeState.ts                    # UNCHANGED at this path — host-agnostic
│           │   ├── pi/                             # MOVED — was packages/harness-kit/src/mode/*.ts
│           │   │   ├── GitBranch.ts
│           │   │   ├── ModePersistence.ts
│           │   │   └── mode-toggle.ts              # MOVED — was packages/harness-kit/src/mode-toggle.ts (Pi event-bus)
│           │   └── opencode/                       # NEW
│           │       └── ModePersistence.ts          # Writes ~/.cache/opencode-effect-harness/projects/<projectID>/mode.json
│           └── session-state/                      # NEW (shared service in principle; currently only the OpenCode adapter consumes it)
│               └── SessionStateStore.ts            # Sidecar JSON per sessionID for skill-load tracking
├── harnesses/effect/
│   ├── package.json                                # Existing pi-effect-harness manifest unchanged
│   ├── skills/                                     # UNCHANGED — 41 skills, shared by both adapters
│   ├── patterns/                                   # UNCHANGED — 46 patterns
│   ├── guidance/                                   # UNCHANGED
│   ├── test/                                       # UNCHANGED
│   └── src/
│       ├── constants.ts                            # UNCHANGED
│       ├── atoms/                                  # UNCHANGED
│       ├── functions/ensureReferenceClone.ts       # UNCHANGED
│       ├── services/                               # UNCHANGED — GuidanceCatalog, PendingSkillReads, ReferenceClone, SkillCatalog
│       │                                           #   (SkillCatalog gains a fromDirectory() factory in addition to fromCommands)
│       ├── hooks/
│       │   ├── ClearPendingSkillReads.ts           # UNCHANGED
│       │   ├── EnsureReferenceClone.ts             # UNCHANGED
│       │   ├── pi/                                 # MOVED — existing Pi-coupled hooks relocated to subdir
│       │   │   ├── EmitSkillLoadedEntry.ts         # appendEntry-based
│       │   │   ├── RebuildSkillCatalog.ts          # pi.getCommands()-based
│       │   │   └── TrackSkillRead.ts               # Pi `read` tool path detection
│       │   └── opencode/                           # NEW — OpenCode-flavored hooks
│       │       ├── EmitSkillLoadedEntry.ts         # SessionStateStore-based via AppendCustomEntry → executor
│       │       ├── RebuildSkillCatalog.ts          # Filesystem glob
│       │       └── TrackSkillRead.ts               # Both `skill` tool name and `read` tool path
│       ├── rules/                                  # UNCHANGED behavior; uses host-agnostic kernel
│       │   ├── InjectEffectPolicyHeader.ts
│       │   ├── RequireLoadedSkillsForEffectWrites.ts
│       │   └── SendPatternFeedbackAfterWrite.ts
│       ├── layers/
│       │   ├── EffectHarnessLayer.ts               # MODIFIED — exports forPi(config) and forOpenCode(config) factories
│       │   └── (no separate per-host files needed; the factories share most internals)
│       └── index.ts                                # UNCHANGED — Pi extension entrypoint
├── harnesses/opencode-effect/                      # NEW — sibling workspace package that publishes the OpenCode plugin
│   ├── package.json                                # name: opencode-effect-harness
│   ├── README.md                                   # OpenCode-specific user docs
│   └── src/
│       └── (no source here — the entrypoint lives at /opencode/plugin.ts;
│          this package exists for publishing convenience)
├── scripts/
│   ├── build-publishable.ts                        # MODIFIED — produces both pi and opencode tarballs
│   ├── build-publishable-pi.ts                     # NEW (or extracted) — Pi-specific build
│   └── build-publishable-opencode.ts               # NEW — OpenCode-specific build
└── (unchanged)
    packages/agentsmd-undriftable/                  # Kept; upstream's tool
    sandboxes/                                      # Kept; upstream's choice
```

**Note on `harnesses/opencode-effect/` vs `opencode/plugin.ts`:** Having both is intentional, mirroring how `harnesses/effect/` has its src co-located. The `harnesses/opencode-effect/` workspace package owns the published metadata (`package.json` with `name`, `version`, `exports`). The actual plugin source lives at the top-level `opencode/plugin.ts` for the same reason `commands/` lives at the top — they're conventional locations OpenCode recognizes when the package is unpacked into a user's plugin directory. The `harnesses/opencode-effect/package.json` `exports` field points at `../../opencode/plugin.ts` and `files` includes `../../opencode/`, `../../commands/`, and `../../harnesses/effect/{skills,patterns,guidance}/`. The publish script materializes the canonical layout in `dist/`.

Alternative (simpler): drop `harnesses/opencode-effect/` and put both `package.json` files for `pi-effect-harness` and `opencode-effect-harness` at `harnesses/effect/package.json` and `harnesses/effect/package.opencode.json`, with the build script picking the right one. Less clean but fewer top-level dirs. Choose during implementation.

### Upstream-mergeability tiers

This stays the same as the previous spec, with a clarification: when this work is offered upstream as a PR, the "Adapter/wiring" tier is what's *new* in upstream, not what diverges. If upstream rejects, we keep both adapters on the fork.

| Tier | Paths | Behavior |
|---|---|---|
| **Content** | `harnesses/effect/{skills,patterns,guidance,test}/` | Shared by both adapters. |
| **Kernel** | `packages/harness-kit/src/{Decision,Pattern,WriteIntent,frontmatter,EditReplacement,SkillIndexEntry,ActiveBranch,UserMessage,Rule,constants,atoms,types,kernel/HarnessRule,kernel/HarnessHook,kernel/MatcherInput,kernel/path,kernel/layers,kernel/services}.ts` | Shared. Bug fixes flow across hosts. |
| **Shared (host-agnostic, but not part of the kernel)** | `packages/harness-kit/src/mode/ModeState.ts`, `packages/harness-kit/src/session-state/` | Used by either adapter. |
| **Pi adapters** | `packages/harness-kit/src/kernel/adapters/pi/`, `packages/harness-kit/src/mode/pi/`, `harnesses/effect/src/hooks/pi/`, `harnesses/effect/src/index.ts` | Pi-only. OpenCode plugin doesn't load these. |
| **OpenCode adapters** | `packages/harness-kit/src/kernel/adapters/opencode/`, `packages/harness-kit/src/mode/opencode/`, `harnesses/effect/src/hooks/opencode/`, `opencode/plugin.ts`, `commands/`, `harnesses/opencode-effect/` | OpenCode-only. Pi extension doesn't load these. |

### Effect version

Bump catalog `effect` from `4.0.0-beta.59` to `4.0.0-beta.65` to match `@opencode-ai/plugin@1.15.0`'s dependency. This is **the load-bearing risk**: it requires `@mariozechner/pi-coding-agent` (which the Pi adapter peer-depends on) to be compatible with beta.65. Two scenarios:

1. **pi-coding-agent is on beta.65 or compatible.** Bump cleanly, both adapters work.
2. **pi-coding-agent is pinned to an older beta.** We have to either coordinate with `pi-mono` upstream, gate the OpenCode adapter behind a separate workspace that pins its own Effect, or accept that the two adapters can't ship from the same `node_modules` install simultaneously (the workspace can still build both, but only one can be installed at a time in a user project).

Verify `pi-coding-agent`'s Effect version pin **before** starting work. If it's incompatible, this becomes a precondition to resolve — either with upstream `pi-mono` or by splitting the harness-kit into two packages.

## Hook bindings

| Pi binding | OpenCode replacement | Notes |
|---|---|---|
| `pi.on("before_agent_start")` → `Decision.InjectSystemPrompt` | `hooks["experimental.chat.system.transform"]`: push merged guidance + skill-load preview onto `output.system` | Fires every turn. No-op when mode is OFF. |
| `pi.on("tool_call")` → block via `Decision.BlockToolCall` | `hooks["tool.execute.before"]`: `write`/`edit`/`patch` + skill count < 7 → throw to block | |
| `pi.on("tool_call")` → track skill reads | `hooks["tool.execute.before"]`: `skill` tool by name, or `read` tool by path | OpenCode hook covers both paths; Pi hook stays path-only. |
| `pi.on("tool_result")` → confirm + persist skill load | `hooks["tool.execute.after"]`: emit `AppendCustomEntry` → `SessionStateStore.recordSkillLoad` | |
| `pi.on("tool_result")` → `Decision.InjectUserMessage` (pattern feedback) | `hooks["tool.execute.after"]`: `client.session.prompt({ path: { id: sessionID }, body: { parts: [{ type: "text", text: feedback }] } })` | User-side turn; model responds. |
| `pi.on("session_start")` → restore mode, rebuild catalog | `hooks.event` with `event.type === "session.created"`: load mode JSON via OpenCode `ModePersistence`, rebuild via filesystem glob, ensure reference clone if enabled | |
| `pi.on("session_tree")` → resync on fork/clone/compact | `hooks.event` with `event.type === "session.compacted"`: clear `SessionStateStore` entries for that sessionID | |
| `pi.on("session_shutdown")` | (dropped) | No equivalent. |
| Pi mode toggle (slash command + badge + persistence) | `commands/toggle-effect-harness.md` + `hooks["command.execute.before"]`: flip OpenCode `ModeState`, write JSON, emit `tui.toast.show`, throw to suppress default | No badge. |
| (Pi skill registration via `pi.skills`) | `hooks.config`: push `<pluginRoot>/harnesses/effect/skills` onto `input.skills.paths` | OpenCode scans in-place. |

### Skill discovery (OpenCode)

Same as previous spec — `config` hook mutates `input.skills.paths`. Untyped in `@opencode-ai/sdk@1.15.0` but accepted at runtime by OpenCode (verified in [`packages/opencode/src/skill/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/skill/index.ts)).

### Pattern catalog and reference clone

Both unchanged. Shared by both adapters.

## Mode toggle (OpenCode adapter)

Same as previous spec — slash command + `command.execute.before` interception + project-scoped sidecar JSON at `~/.cache/opencode-effect-harness/projects/<projectID>/mode.json`. The Pi adapter retains its existing toggle UX (badge + Pi mode-toggler integration).

## Session-state replacement (OpenCode adapter)

`SessionStateStore` lives in `packages/harness-kit/src/session-state/` as a shared service, used only by the OpenCode adapter. The Pi adapter continues to use `pi.appendEntry`. The split happens at the `DecisionExecutor` level: Pi's executor translates `Decision.AppendCustomEntry` into `pi.appendEntry(...)`, OpenCode's translates it into `SessionStateStore.recordSkillLoad(...)`.

`ActiveBranch.Value` is constructed differently per host:
- **Pi**: `BranchSnapshot.fromPiEntries(ctx.sessionManager.getBranch())` (existing).
- **OpenCode**: `BranchSnapshot.fromSessionStateStore(sessionID)` (new).

Both produce the same `ActiveBranch.Value` shape with synthetic `CustomEntry` records of type `pi-effect-harness:skill-loaded`. The downstream atoms (`activeBranchLoadedEffectSkills`) read these without knowing or caring how they were populated.

## Layer wiring

`EffectHarnessLayer` becomes a namespace with two factory functions:

```ts
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

  export const forPi = (config: PiConfig): Layer.Layer<...> => { ... };
  export const forOpenCode = (config: OpenCodeConfig): Layer.Layer<...> => { ... };
}
```

Both share the same `baseLayer` (kernel + guidance catalog + pattern catalog + ModeState + ReferenceClone + SkillCatalog + PendingSkillReads). They differ in:
- Which mode persistence layer is provided.
- Whether SessionStateStore is provided.
- Which hooks are in the `HookSet`.

## Build and publish

Two tarballs from one workspace:

1. `pi-effect-harness` — exactly what upstream already publishes. Built from `harnesses/effect/{src/index.ts, skills, patterns, guidance}` plus the Pi adapter files.
2. `opencode-effect-harness` — new. Built from `opencode/plugin.ts` + the OpenCode adapter files + the same shared content.

Both bundle the kernel; `pi-harness-kit` remains a workspace-internal package that isn't separately published.

`scripts/build-publishable.ts` becomes a dispatcher (`bun run build:publishable pi` or `bun run build:publishable opencode`). The Pi script stays close to what's there today; the OpenCode script is new.

## What we lose vs Pi-only upstream

(For the OpenCode adapter specifically; Pi adapter is unchanged.)

- **Gold status badge in the footer.** No OpenCode equivalent.
- **`session_shutdown` cleanup.** No equivalent. Dropped.
- **Branch-scoped skill-load state.** Session-scoped via sidecar JSON. Compact still resets, so user-visible behavior is the same.

## Known unknowns

- **Pi adapter's Effect version compatibility with beta.65.** Must verify before starting. If incompatible, decide between (a) coordinating with `pi-mono` upstream to bump, (b) keeping each adapter on its own Effect version in separate workspace packages, or (c) holding the OpenCode adapter on beta.59 and accepting that it'll run two Effect copies in the OpenCode process (broken — services compare by reference, this is not viable; treat as a hard block).
- **Whether `mpsuesser` wants to host the OpenCode adapter upstream.** Build first, ask second. Either way the work isn't wasted.
- **Naming.** If the OpenCode adapter lands upstream, the umbrella repo name probably shouldn't stay `pi-effect-harness`. That's a discussion to have *after* showing working code.

## Effort estimate

Roughly 3–4 days, similar to the fork plan. Per-host subdirs and dual layer factories cost ~half a day more than the fork's straight replacement; we recover that by skipping the rebrand, the agentsmd-undriftable removal, and the Pi-dep removal.

- **Day 1**: Fork, verify Pi adapter's Effect compatibility with beta.65, bump if safe, scaffold no-op OpenCode plugin entrypoint. Move existing Pi adapters into `pi/` subdir; verify Pi tests still pass.
- **Day 2**: New OpenCode adapters in `opencode/` subdirs. `SessionStateStore`. OpenCode `ModePersistence`. Both `BranchSnapshot` variants. Tests for the new code.
- **Day 3**: New `forOpenCode` layer factory. Wire OpenCode plugin entrypoint. Smoke test. Skill catalog filesystem-glob factory.
- **Day 4**: Build script split. README additions documenting the OpenCode adapter alongside the Pi one. Full QA against a real Effect project under OpenCode. Push fork; open PR upstream.

## Out of scope

- Replicating Pi's gold footer badge.
- Migrating `packages/agentsmd-undriftable/` anywhere.
- Adding new patterns or skills.
- Removing the Pi adapter (we're explicitly keeping it).
- Stripping `effect-*` skills from the OpenCode `<available_skills>` block when toggle is OFF (server-side caching makes this unreliable; out of scope).
- Coordinating an upstream `pi-mono` Effect bump (if needed, that becomes a precondition issue, not part of this work).
