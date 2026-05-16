# AGENTS.md — pi-effect-harness

A bun workspace that publishes two plugins from a shared core:

- [`pi-effect-harness`](./harnesses/effect): the original [Pi](https://pi.dev) extension.
- [`opencode-effect-harness`](./harnesses/opencode-effect): a sibling [OpenCode](https://opencode.ai) plugin.

Both adapters share the kernel, rules, atoms, skills, patterns, and guidance. The host-specific split is at:

- `packages/harness-kit/src/kernel/adapters/{pi,opencode}/`
- `packages/harness-kit/src/mode/{pi,opencode}/` (with `ModeState.ts` at `mode/` top level — shared)
- `packages/harness-kit/src/session-state/` (shared service consumed by the OpenCode adapter)
- `harnesses/effect/src/hooks/{pi,opencode}/`
- `harnesses/effect/src/index.ts` (Pi entry) vs `opencode/plugin.ts` (OpenCode entry)
- `harnesses/effect/package.json` (`pi-effect-harness`) vs `harnesses/opencode-effect/package.json` (`opencode-effect-harness`)

See [README.md](./README.md) for the Pi-flavored user docs and [harnesses/opencode-effect/README.md](./harnesses/opencode-effect/README.md) for OpenCode-flavored docs.

## Layout

```
opencode/
  plugin.ts              OpenCode plugin entrypoint. Wires the OpenCode hook
                         API (config, experimental.chat.system.transform,
                         tool.execute.before/after, command.execute.before,
                         event) to the shared rule/hook/decision pipeline.

packages/
  harness-kit/           Internal kernel — Effect services for rules, hooks,
                         decisions, write projection, pattern matching.
                         Shared by both adapters. The Pi-specific adapter
                         glue lives under {kernel/adapters,mode}/pi/, the
                         OpenCode glue under {kernel/adapters,mode}/opencode/,
                         and host-agnostic services (ModeState, SessionStateStore,
                         the kernel itself) live at the package top level.
  agentsmd-undriftable/  CLI (`amdu`) for keeping AGENTS.md sections
                         deterministically generated from TypeScript source
                         via ts-morph. Independent utility, lives here for now.

harnesses/
  effect/                The Pi extension package (`pi-effect-harness`). Also
                         hosts the shared content (skills, patterns, guidance)
                         used by both adapters.
    src/                 Pi entrypoint (index.ts), services, rules, atoms.
                         Hooks split into hooks/pi/ and hooks/opencode/;
                         hooks at the hooks/ top level (ClearPendingSkillReads,
                         EnsureReferenceClone) are host-agnostic.
    patterns/            46 ast-grep / regex pattern detectors (md + YAML).
    skills/              41 effect-* skills. Pi loads them via its command
                         system; OpenCode discovers them by registering
                         harnesses/effect/skills/ in config.skills.paths.
    guidance/            Markdown docs merged into the system-prompt header.
    test/                One file per source module + cross-cutting tests
                         (all-patterns-covered, skill-gate-projection,
                         guidance-docs-injection, comment-string-false-positives).
  opencode-effect/       The OpenCode plugin package (`opencode-effect-harness`).
    package.json         Workspace metadata; depends on pi-effect-harness +
                         pi-harness-kit via workspace:* (inlined at publish).
                         The runtime source lives at /opencode/plugin.ts;
                         this package owns the publishable npm artifact.

sandboxes/
  amdu-demo/             Throwaway projects for trying things out.
                         Treat as ephemeral.
```

The split between `harness-kit` and `harnesses/effect` is not load-bearing. Code migrates between the two as the kernel firms up. If something feels miscategorized, it probably is — move it.

## Verification

```sh
bun run check          # dprint format + oxlint + tsgo typecheck
bun run test           # vitest run

bun run check && bun run test   # what CI runs
```

Single tests:

```sh
bunx vitest run harnesses/effect/test/avoid-any.test.ts
bunx vitest run -t "blocks Effect writes"
```

`bun install` runs `effect-tsgo patch` in `prepare` to patch tsgo for Effect's type-level encoding. Expected; not a problem.

## Where to look for common changes

| Task | Start here |
|---|---|
| Add or modify a pattern | `harnesses/effect/patterns/<name>.md` + `harnesses/effect/test/<name>.test.ts`. Use `testPattern({ name, shouldMatch, shouldNotMatch })` from `test/helpers/pattern-test-harness.ts`. |
| Add or modify a skill | `harnesses/effect/skills/<name>/SKILL.md`. Pi loads them via its command system at session start; OpenCode discovers them by registering `harnesses/effect/skills/` in OpenCode's `config.skills.paths`. |
| Change what gets injected into the system prompt | `harnesses/effect/guidance/*.md` (content) or `harnesses/effect/src/services/GuidanceCatalog.ts` (composition + the runtime preview line). |
| Change a Pi event handler | `harnesses/effect/src/index.ts` (Pi-side wiring) → `HarnessController` → `RuleSet` / `HookSet`. New rules go in `src/rules/`; Pi-only hooks go in `src/hooks/pi/`, host-agnostic in `src/hooks/`. |
| Change an OpenCode plugin hook | `opencode/plugin.ts` (OpenCode-side wiring) → `HarnessController` → `RuleSet` / `HookSet`. The plugin's `config`, `experimental.chat.system.transform`, `tool.execute.before`/`after`, `command.execute.before`, and `event` handlers all flow through `HarnessController`. OpenCode-only hooks live in `harnesses/effect/src/hooks/opencode/`. |
| Add a host-agnostic rule | `harnesses/effect/src/rules/`. The three existing rules (`InjectEffectPolicyHeader`, `RequireLoadedSkillsForEffectWrites`, `SendPatternFeedbackAfterWrite`) are loaded by both adapters via the `forPi` and `forOpenCode` factories in `harnesses/effect/src/layers/EffectHarnessLayer.ts`. |
| Change kernel behavior | `packages/harness-kit/src/`. Decisions in `Decision.ts`, services in `kernel/services/`, rule/hook contracts in `kernel/Harness*.ts`. |
| Change how a write is projected for matching | `packages/harness-kit/src/kernel/services/WriteProjection.ts`. |
| Touch the AGENTS.md generator | `packages/agentsmd-undriftable/src/`. The `amdu` binary; markers are `<!-- amdu:begin -->` / `<!-- amdu:end -->`. |

## Conventions

This repo enforces its own harness on its own source. The Effect-first laws and pattern set live in:

- [`harnesses/effect/guidance/effect-first-development.md`](./harnesses/effect/guidance/effect-first-development.md) — the full Effect-first specification.
- [`harnesses/effect/patterns/`](./harnesses/effect/patterns/) — every pattern that would fire on a write.

Read those rather than asking how to write code here. If you find a pattern that should fire but doesn't, that's a bug in the pattern and worth fixing.

The dprint config (`dprint.json`) handles whitespace, quote style, semis, etc. — `bun run fmt` is the source of truth there. Markdown is not formatted; pattern bodies and skill content are freeform.

## Effect references

`~/.cache/effect-v4/` is the shared user-scoped clone of [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) maintained by the harness. Use it for Effect v4 API lookups. Don't guess at v4 APIs — `bun run typecheck` will catch you, but reading the source is faster.

## Things in flight

A few areas to be light-handed with:

- The `harness-kit` ↔ `harnesses/effect` boundary. The kernel may eventually be lifted out as a standalone library; until then, expect occasional refactors that move code across this line.
- `packages/agentsmd-undriftable/` is being developed in-tree because it's useful for this repo's own AGENTS.md generation. It may move to its own repo later.
- `sandboxes/*` is for trying things out. Don't build durable infrastructure there.

## Reference

- [README.md](./README.md) — user-facing extension docs (skills, patterns, lifecycle).
- [CONTRIBUTING.md](./CONTRIBUTING.md) — PR workflow.
- [`pi` extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/pi-coding-agent/docs/extensions.md) — Pi's `ExtensionAPI`, lifecycle events, mode toggles.
