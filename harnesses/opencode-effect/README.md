# opencode-effect-harness

An [OpenCode](https://opencode.ai) plugin that teaches the agent to write Effect v4. Sibling to [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness); shares the same 41 `effect-*` skills, 46 pattern detectors, guidance docs, and Effect-TS reference clone.

## Hosts

This workspace publishes two plugins from the same source:

- **`opencode-effect-harness`** — the OpenCode plugin, documented in the rest of this README.
- **`pi-effect-harness`** — the original [Pi coding agent](https://pi.dev) extension. Documented in the [workspace root README](../../README.md).

The two adapters live side-by-side in `packages/harness-kit/src/kernel/adapters/{pi,opencode}/` and `harnesses/effect/src/hooks/{pi,opencode}/`. Skills, patterns, guidance, the kernel itself, and the three host-agnostic rules are shared.

---

## Table of contents

- [What it does](#what-it-does)
- [Install](#install)
- [Usage](#usage)
- [How it works](#how-it-works)
  - [Lifecycle](#lifecycle)
  - [The skill gate](#the-skill-gate)
  - [The policy header](#the-policy-header)
  - [The pattern feedback loop](#the-pattern-feedback-loop)
  - [The reference clone](#the-reference-clone)
- [Skill catalog](#skill-catalog) (41)
- [Pattern catalog](#pattern-catalog) (46)
- [Configuration](#configuration)
- [Caveats](#caveats)
- [Development](#development)
- [License](#license)

---

## What it does

When the plugin is installed (and `/toggle-effect-harness` mode is enabled — the default per project):

- The skill catalog (41 `effect-*` skills) is registered into OpenCode's `config.skills.paths` via the plugin's `config` hook. Skills appear in OpenCode's native `<available_skills>` block; the agent can load them via the `skill` tool or by `read`-ing the `SKILL.md` directly. Both paths count toward the gate.
- The system prompt is augmented every turn via `experimental.chat.system.transform` with `effect-first-development.md` (40+ rules covering errors, schemas, layers, services, retries, timeouts, structured concurrency, and observability), a progressive-disclosure agent-rules doc, and a "loaded *N*/7 effect-\* skills in this session" preview.
- Tool calls that would write Effect code are **blocked** in `tool.execute.before` until at least 7 `effect-*` skills have been loaded in the current session. The check uses a prospective write projection: it looks at the resulting file, so deletion-only changes that leave no Effect code are not blocked.
- After every successful write, `tool.execute.after` runs the post-write file against 46 pattern detectors. Matches are sorted by severity and delivered as a user-side turn via `client.session.prompt`, which the agent answers in-band.
- A shallow clone of [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) is maintained at `~/.cache/effect-v4/` and refreshed to the latest Effect v4 beta source. The agent reads from this shared user cache to verify v4 APIs instead of guessing.

Everything else about your OpenCode session is unchanged. Toggle `/toggle-effect-harness` off and the harness disengages cleanly — the system prompt reverts on the next turn, the gate stops firing, and the pattern loop stops emitting feedback. The skill catalog stays registered either way; only the four harness behaviors are gated by the toggle.

---

## Install

Three options, in order of preference.

**npm-listed plugin** — add to `opencode.json` per-project or in `~/.config/opencode/opencode.json` globally:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-effect-harness"]
}
```

OpenCode auto-installs npm-listed plugins on the next session start.

**Project-vendored plugin** — drop the tarball into your project's `.opencode/plugins/`:

```bash
bun add /path/to/opencode-effect-harness-0.1.0.tgz
```

Then list `"opencode-effect-harness"` in `opencode.json`.

**Local checkout** (for plugin development) — point at the plugin entrypoint directly:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/opencode/plugin.ts"]
}
```

The first time the plugin loads, it clones `Effect-TS/effect-smol` into `~/.cache/effect-v4/` (~30s, shallow, fail-silent). Subsequent sessions reuse the clone and refresh it before each agent turn.

---

## Usage

| | |
|---|---|
| Toggle | `/toggle-effect-harness` (slash command) |
| Status | Toast via `tui.toast.show` after toggling; no persistent badge |
| Persistence | Project-scoped, keyed by `project.id` from `PluginInput.project`; persisted at `~/.cache/opencode-effect-harness/projects/<projectID>/mode.json`. Default: enabled. |
| Skill loading | `skill({ name: "effect-error-handling" })` or `read({ filePath: ".../SKILL.md" })`. Both count. |
| Activation cost | First time per user cache: shallow clone of `effect-smol`; later enabled turns do a shallow refresh |
| Per-turn cost | ~3 KB of system-prompt headers + the merged guidance docs |

When mode is off, no policy header is injected and no write gate or pattern feedback fires. The harness still maintains its skill catalog and reference clone so the loaded-skill count is ready if you re-enable.

---

## How it works

The plugin is a thin shell around an [Effect](https://effect.website) `ManagedRuntime`. OpenCode plugin hook events are forwarded to a `HarnessController`, which fans them out to a `RuleSet` and a `HookSet`. Rules return `Decision` values; a `DecisionExecutor` translates those decisions back into OpenCode SDK calls (`client.session.prompt`, `tui.toast.show`, throwing to block tool calls, pushing onto `output.system`).

### Lifecycle

```
config                            ─► register harnesses/effect/skills/ on
                                     config.skills.paths

session.created (event)           ─► restore mode state · clear SessionStateStore
                                  · rebuild SkillCatalog · ensure ReferenceClone

experimental.chat.system.transform ─► HookSet
                                  │     └─► EnsureReferenceClone (refresh if enabled)
                                  └─► RuleSet
                                        └─► InjectEffectPolicyHeader
                                              └─► push onto output.system

tool.execute.before
  ├─► HookSet
  │     └─► TrackSkillRead
  │           ├─► skill tool: by name
  │           └─► read tool:  by path against SkillCatalog
  └─► RuleSet
        └─► RequireLoadedSkillsForEffectWrites
              ├─► WriteProjection.prospective(cwd, writeIntent)
              └─► throw Error(blockReason)  if Effect code present and skills < 7

tool.execute.after
  ├─► HookSet
  │     └─► ConfirmSkillLoad (SessionStateStore.add for successful skill reads)
  └─► RuleSet
        └─► SendPatternFeedbackAfterWrite
              ├─► WriteProjection.actual(cwd, writeIntent)
              ├─► PatternMatcher × 46 patterns
              └─► client.session.prompt({ parts: [{ type: 'text', text: ... }] })

command.execute.before  /toggle-effect-harness ─► flip mode · tui.toast.show
                                                  · throw to suppress LLM call

session.compacted (event) ─► SessionStateStore.clear(sessionID)
```

Three host-agnostic rules plus session/tool hooks. The `config` hook registers skills once; everything else flows through `Decision`. Rule code never touches the SDK directly, which keeps the rules trivially testable in isolation against an in-memory executor.

### The skill gate

Effect v4 is wide. A model writing Effect cold — without any in-context skill — will reliably produce v3 patterns: `Effect.catchAll`, `Schema.parseJson`, `Data.TaggedError`, `OptionFromSelf`, `compose(...)` instead of `decodeTo(...)`, untraced `Effect.gen` everywhere. The skill gate exists to make the agent stop and read before writing.

**What counts as a skill.** Each subdirectory under `harnesses/effect/skills/` has a `SKILL.md` with frontmatter. The plugin's `config` hook pushes `harnesses/effect/skills/` onto `config.skills.paths`, so OpenCode surfaces all 41 as native skills in the `<available_skills>` block. The harness watches every `tool.execute.before`:

- If the tool is `skill`, it remembers the skill name keyed by `callID`.
- If the tool is `read`, the path is resolved against the live `SkillCatalog` and matched against known `effect-*` skill paths.

On `tool.execute.after`, if the call succeeded, the corresponding skill name is added to that session's `SessionStateStore`.

**What "loaded" means.** Loaded-skill state lives in a sidecar JSON file at `~/.cache/opencode-effect-harness/sessions/<sessionID>.json`. The `activeSessionLoadedEffectSkills` lookup reads it and returns a `ReadonlySet<string>`. This means:

- `/compact` resets the count via the `session.compacted` event — re-loading skills after a context reset is a feature, not a bug.
- The count is monotonic *within* a session.
- The count does NOT carry across sessions; each new session ID starts at zero.

**The threshold.** `MIN_EFFECT_SKILLS = 7`. Schema, Error Handling, and Layers cover ~70% of any Effect codebase; the remaining four should be task-relevant (AI, SQL, HTTP, CLI, RPC, Workflow, Stream, Testing, Observability, etc.). Seven is calibrated, not arbitrary — fewer and the model still hallucinates; more and the activation friction outweighs the benefit.

**Why prospective projection matters.** The gate runs on `WriteProjection.prospective(cwd, writeIntent)`, which reconstructs *what the file will look like after the write/edit applies*. A change whose resulting file no longer matches `\bEffect\b|from\s+['"]effect.*['"]` is allowed through. A change whose resulting file contains Effect code is gated. This means deletion-only Effect cleanup can proceed without artificially incrementing the skill counter.

**How the block surfaces.** OpenCode's `tool.execute.before` hook signals "do not run this call" by throwing. The harness throws an `Error` whose message quotes the loaded count, the missing count, and a hint to read from `~/.cache/effect-v4/` if any API is unclear. OpenCode surfaces the thrown message to the agent as a tool-call failure; the agent retries after loading more skills.

### The policy header

Every turn while mode is enabled, `experimental.chat.system.transform` invokes `InjectEffectPolicyHeader`, which emits a `Decision.InjectSystemPrompt`. The executor pushes the resulting text onto `output.system` (OpenCode merges these alongside model and provider system prompts). Content is the merged contents of `harnesses/effect/guidance/`:

| File | Contents |
|---|---|
| `effect-first-development.md` | The full Effect-first specification: 40+ numbered laws (EF-1 … EF-40) covering tagged errors, `Option`, schema, canonical imports, `Match`, services & layers, `Clock`, observability, `Duration`, JSON via `Schema`, scoped resources, retries, timeouts, structured concurrency, parallel concurrency, `Config`, `Redacted`, defects vs. failures, layer memoization isolation, schema-first domain modeling, schema defaults, branded guards, equivalence, transformations, native sort, dual APIs. Followed by copy-paste templates and a 45-item LLM review checklist. |
| `progressive-disclosure-guidance.md` | Short, imperative agent rules: "load AT LEAST 7 effect-\* skills before any Effect work; if anything is unclear, read from `~/.cache/effect-v4/`." |
| `post__effect-and-the-near-inexpressible-majesty-of-layers.md` | A long-form essay defending Effect's `Layer` type. Included for the same reason a system prompt cites a style guide: priors matter. |

Followed by a runtime line:

```
opencode-effect-harness policy:
- Before planning or writing Effect code, read at least 7 relevant effect-* skills.
  Loaded this session: 3/7 (effect-error-handling, effect-layer-design, effect-schema-v4).
- If any Effect v4 API is unclear, read from the local Effect reference clone instead of guessing.
- Key reference paths: ~/.cache/effect-v4/LLMS.md, ~/.cache/effect-v4/MIGRATION.md,
  ~/.cache/effect-v4/packages/effect/SCHEMA.md, ~/.cache/effect-v4/packages/effect/HTTPAPI.md,
  ~/.cache/effect-v4/packages/effect/src/.
```

The skill preview is sorted, capped at 7 names, with `(+N more)` for overflow. The full guidance is loaded once at layer construction and re-emitted from memory each turn.

### The pattern feedback loop

After a successful write, every pattern under `harnesses/effect/patterns/` is matched against the actual post-write file via `PatternMatcher`. Each pattern is a markdown file with YAML frontmatter:

```yaml
---
action: context
tool: (edit|write)
event: after
name: avoid-data-tagged-error
description: Use Schema.TaggedErrorClass instead of Data.TaggedError for serialization and RPC compatibility
glob: '**/*.{ts,tsx}'
detector: ast
pattern: Data.TaggedError($$$)
level: warning
suggestSkills:
    - effect-error-handling
---

# Use `Schema.TaggedErrorClass` Instead of `Data.TaggedError`
…
```

Detectors are either ast-grep rules (single pattern, list of patterns, or full rule object with `inside` / `constraints`) or regex with comment-skipping. Severity levels are `critical`, `high`, `medium`, `warning`, `info`. Matches are de-duplicated and sorted by severity.

OpenCode has no native "inject user message" primitive, so the executor delivers the feedback via `client.session.prompt`:

```ts
await client.session.prompt({
  path: { id: sessionID },
  body: {
    parts: [{ type: 'text', text: feedbackBody }],
  },
});
```

The prompt appears as a user-side turn in the OpenCode transcript and the agent answers it in-band. The body looks like:

```
opencode-effect-harness review request:
File: `src/services/MyThing.ts`

I noticed potential Effect-pattern issues in the write you just completed.
Please inspect this change now.
If the warning is valid, revise the code before continuing.
If you believe it is a false positive or an intentional exception, briefly say so and continue.

Matched patterns:
- avoid-data-tagged-error [warning]: Use Schema.TaggedErrorClass instead of Data.TaggedError…

Relevant guidance:
## avoid-data-tagged-error
…(the full body of the pattern's markdown, plus suggested skills hints)…
```

This is the closest OpenCode equivalent to Pi's `Decision.InjectUserMessage` with "steer" delivery: cosmetically louder (it shows up as a visible user turn rather than an invisible injection), functionally identical.

The pattern bodies use a Haskell-style transformation diagram convention — type signatures for the bad and good forms, then a one-paragraph rationale. This is harness-internal style, not a requirement; you can fork the patterns and use whatever rationale format you prefer.

The `suggestedSkills` field is appended to the matched-pattern feedback as: *"If you have not loaded the `effect-error-handling` skill, you should load it before continuing."* This closes the feedback loop: a pattern miss surfaces both the rule and the skill that documents it.

### The reference clone

Effect v4 is moving fast. Beta releases ship with API renames in nearly every minor (`catchAll → catch`, `parseJson → fromJsonString`, `Either → Result`, `compose → decodeTo`, the entire `*FromSelf` suffix removal, etc.). The most reliable way to keep an agent honest is to give it the source.

On `session.created` and on every `experimental.chat.system.transform` while mode is enabled, `EnsureReferenceClone` maintains a single user-scoped clone of `Effect-TS/effect-smol` at `~/.cache/effect-v4/`. If the cache is absent, it runs `git clone --depth 1 --single-branch` into `~/.cache/effect-v4.cloning/` and atomically renames it into place. If the cache already exists, it refreshes `origin`, updates `origin/HEAD`, and hard-resets to the latest Effect v4 beta source commit.

Properties:

- **Atomic first clone**: the initial clone happens in a temp directory and is `rename()`-d into place. Either `~/.cache/effect-v4/` is present and complete, or it is absent.
- **Shared**: the cache is user-scoped, not project-scoped; all projects with Effect mode enabled (in both Pi and OpenCode) reuse the same clone.
- **Always refreshed**: existing clones fetch `origin` with depth 1, update `origin/HEAD`, reset to it, and clean untracked files. No project-local `effect` version is detected or matched.
- **Single-flight**: a module-level `clonePromise` deduplicates concurrent invocations across hooks, and a lightweight cache lock avoids cross-process clone/update races.
- **Fail-silent**: a clone or refresh failure (no network, git not on PATH) never blocks the agent. The harness continues without the reference; the policy header still tells the agent the paths to look for.

The agent doesn't have to know any of this. It sees `~/.cache/effect-v4/LLMS.md` and `~/.cache/effect-v4/packages/effect/SCHEMA.md` mentioned in the policy header, and reads them like any other file.

---

## Skill catalog

41 skills, registered into OpenCode's native skill system via `config.skills.paths`. Surfaced in the `<available_skills>` block; load with `skill({ name: "<name>" })` or by `read`-ing the `SKILL.md`.

### AI / LLM (6)

| Skill | Description |
|---|---|
| [`effect-ai-chat`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-chat/SKILL.md) | Stateful AI chat sessions with the Effect Chat module — multi-turn conversations, agentic tool-calling loops, persistence, streaming, structured object generation. |
| [`effect-ai-language-model`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-language-model/SKILL.md) | The Effect AI `LanguageModel` service — text generation, structured output, streaming, tool calling, schema-validated responses. |
| [`effect-ai-prompt`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-prompt/SKILL.md) | The complete Prompt API for constructing, merging, and manipulating LLM conversations using messages, parts, and composition operators. |
| [`effect-ai-provider`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-provider/SKILL.md) | `@effect/ai` provider layers (Anthropic, OpenAI, OpenAI-Compat, OpenRouter) with config management, model abstraction, `ExecutionPlan` fallback, runtime overrides. |
| [`effect-ai-streaming`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-streaming/SKILL.md) | Streaming response patterns: start/delta/end protocol, accumulation strategies, resource-safe consumption, history management with `SubscriptionRef`. |
| [`effect-ai-tool`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-ai-tool/SKILL.md) | Tool and Toolkit APIs — type-safe tool definitions, parameter validation, handler implementations, user- and provider-defined tools. |

### Schema & domain modeling (8)

| Skill | Description |
|---|---|
| [`effect-schema-v4`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-schema-v4/SKILL.md) | Authoritative reference for Effect Schema v4 API changes and v3 → v4 migration. Find-and-replace tables, breaking changes, idiom shifts. |
| [`effect-schema-composition`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-schema-composition/SKILL.md) | `Schema.decodeTo`, transformations, filters, multi-stage validation. |
| [`effect-domain-modeling`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-domain-modeling/SKILL.md) | Production-ready domain models with `Schema.TaggedStruct` — ADTs, predicates, orders, guards, match functions. |
| [`effect-domain-predicates`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-domain-predicates/SKILL.md) | Comprehensive predicates and orders for domain types using typeclass patterns. |
| [`effect-typeclass-design`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-typeclass-design/SKILL.md) | Curried signatures and dual data-first / data-last APIs. |
| [`effect-pattern-matching`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-pattern-matching/SKILL.md) | `Data.TaggedEnum`, `$match`, `$is`, `Match.typeTags`, `Effect.match`. Avoid manual `_tag` checks. |
| [`effect-context-witness`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-context-witness/SKILL.md) | When to use `Context.Service` witness vs. capability patterns; coupling trade-offs. |
| [`effect-optics`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-optics/SKILL.md) | `Iso`, `Lens`, `Prism`, `Optional`, `Traversal` — composable, type-safe access and immutable updates to nested data. |

### Layers, services, runtime (5)

| Skill | Description |
|---|---|
| [`effect-layer-design`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-layer-design/SKILL.md) | Designing and composing layers for clean dependency management. |
| [`effect-service-implementation`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-service-implementation/SKILL.md) | Fine-grained service capabilities; avoiding monolithic designs. |
| [`effect-managed-runtime`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-managed-runtime/SKILL.md) | Bridging Effect into non-Effect frameworks (Hono, Express, Fastify, Lambda, Workers) via `ManagedRuntime`. |
| [`effect-platform-abstraction`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-platform-abstraction/SKILL.md) | Cross-platform file I/O, process spawning, HTTP clients, terminal — the abstraction itself. |
| [`effect-platform-layers`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-platform-layers/SKILL.md) | Structuring platform-layer provision for cross-platform applications. |

### Errors, config, observability (4)

| Skill | Description |
|---|---|
| [`effect-error-handling`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-error-handling/SKILL.md) | `Schema.TaggedErrorClass`, `catchTag`/`catchTags`, `catchReason`/`catchReasons`, `Cause`, `ErrorReporter`, recovery patterns. |
| [`effect-config`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-config/SKILL.md) | `Config` and `ConfigProvider` — env vars, structured config, test config, `.env`, JSON, custom sources. |
| [`effect-observability`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-observability/SKILL.md) | Structured logging, distributed tracing, metrics; OTLP/Prometheus export. |
| [`effect-wide-events`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-wide-events/SKILL.md) | Wide events (canonical log lines) for observability. Conceptual guide for instrumentation strategy. |

### Data, IO, concurrency (7)

| Skill | Description |
|---|---|
| [`effect-stream`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-stream/SKILL.md) | Pull-based streaming pipelines — creation, transformation, consumption, encoding (NDJSON/Msgpack), concurrency, resource safety. |
| [`effect-batching`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-batching/SKILL.md) | `Request`, `RequestResolver`, `SqlResolver` — N+1 elimination, batched data-fetching layers, request caching. |
| [`effect-pubsub-event-bus`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-pubsub-event-bus/SKILL.md) | Typed event buses with `PubSub` and `Stream`. |
| [`effect-filesystem`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-filesystem/SKILL.md) | Cross-platform file I/O across Node.js, Bun, browser. |
| [`effect-path`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-path/SKILL.md) | Cross-platform path operations — joining, resolving, URL conversion. |
| [`effect-command-executor`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-command-executor/SKILL.md) | `ChildProcess` — shell commands, captured output, piping, streaming, scoped lifecycle. |
| [`effect-concurrency-testing`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-concurrency-testing/SKILL.md) | Testing `PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`, `Stream`. |

### Persistence & networking (4)

| Skill | Description |
|---|---|
| [`effect-sql`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-sql/SKILL.md) | `SqlClient`, `SqlSchema`, `SqlModel` (CRUD repos), `SqlResolver`, `Migrator`. |
| [`effect-http-api`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-http-api/SKILL.md) | `HttpApi`, `HttpApiClient`, `HttpApiBuilder` — typed endpoints, security middleware, OpenAPI, derived clients. |
| [`effect-rpc-cluster`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-rpc-cluster/SKILL.md) | RPC endpoints, cluster routing, workflow patterns with Effect RPC and Cluster. |
| [`effect-workflow`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-workflow/SKILL.md) | Durable workflows with `Workflow`, `Activity`, `DurableClock`, `DurableDeferred` — execution that survives restarts, compensation (saga), distribution via Cluster. |

### CLI & MCP (2)

| Skill | Description |
|---|---|
| [`effect-cli`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-cli/SKILL.md) | Type-safe CLI applications — argument parsing, options, commands, dependency injection. |
| [`effect-mcp-server`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-mcp-server/SKILL.md) | MCP servers with `McpServer`, `McpSchema`, `Tool`, `Toolkit`; stdio and HTTP transports. |

### Testing & migration (2)

| Skill | Description |
|---|---|
| [`effect-testing`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-testing/SKILL.md) | `@effect/vitest` and `it.effect(...)` — services, layers, time-dependent effects, error handling, property-based testing. |
| [`effect-incremental-migration`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-incremental-migration/SKILL.md) | Migrating async/Promise-based modules to Effect services while preserving backward compatibility. |

### React (3)

| Skill | Description |
|---|---|
| [`effect-atom-state`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-atom-state/SKILL.md) | Reactive state management with Effect Atom for React applications. |
| [`effect-react-composition`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-react-composition/SKILL.md) | Composable React components using Effect Atom; avoiding boolean props; integrating with Effect's reactive state. |
| [`effect-react-vm`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/skills/effect-react-vm/SKILL.md) | The VM (View Model) pattern for reactive, testable frontend state management. |

---

## Pattern catalog

46 patterns run after successful `edit`/`write` tool calls when the written path matches the pattern's frontmatter `glob`. Most target TypeScript/TSX, but some use narrower or negated globs. Detectors are declared per pattern as either ast-grep rules or comment-skipping regex.

### `avoid-*` (20)

| Pattern | Level | Description |
|---|---|---|
| [`avoid-any`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-any.md) | warning | `as any` and `as unknown` type assertions. |
| [`avoid-data-tagged-error`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-data-tagged-error.md) | warning | `Data.TaggedError` — use `Schema.TaggedErrorClass` for serialization and RPC compatibility. |
| [`avoid-direct-json`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-direct-json.md) | info | `JSON.parse` / `JSON.stringify` — use `Schema.fromJsonString` or `Schema.UnknownFromJsonString`. |
| [`avoid-direct-tag-checks`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-direct-tag-checks.md) | warning | Direct `_tag` property checks; use exported refinements/predicates. |
| [`avoid-expect-in-if`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-expect-in-if.md) | warning | `expect()` calls nested inside `if` blocks in tests. |
| [`avoid-mutable-state`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-mutable-state.md) | info | `let` bindings inside Effect services; prefer `Ref`. |
| [`avoid-native-fetch`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-native-fetch.md) | warning | Native `fetch` — use Effect HTTP modules. |
| [`avoid-node-imports`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-node-imports.md) | warning | Catch-all for `node:` imports not covered by a dedicated `use-*-service` rule. |
| [`avoid-non-null-assertion`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-non-null-assertion.md) | warning | `!` non-null assertion operator. |
| [`avoid-object-type`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-object-type.md) | warning | `Object` and `{}` as types. |
| [`avoid-option-getorthrow`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-option-getorthrow.md) | warning | `Option.getOrThrow` — use `Option.match` or `Option.getOrElse`. |
| [`avoid-platform-coupling`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-platform-coupling.md) | warning | Binding packages importing platform-specific packages like `@effect/platform-bun`. |
| [`avoid-process-env`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-process-env.md) | warning | `process.env` — use `Config.*`. |
| [`avoid-react-hooks`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-react-hooks.md) | high | `useState`/`useEffect`/`useReducer` etc. — use VMs with Effect Atom. |
| [`avoid-schema-suffix`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-schema-suffix.md) | info | Schema constants suffixed with `Schema`; name them after the domain type. |
| [`avoid-sync-fs`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-sync-fs.md) | high | Synchronous filesystem operations. |
| [`avoid-try-catch`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-try-catch.md) | warning | `try`/`catch` in Effect code — use `Effect.try` or typed errors. |
| [`avoid-ts-ignore`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-ts-ignore.md) | warning | `@ts-ignore` and `@ts-expect-error`. |
| [`avoid-untagged-errors`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-untagged-errors.md) | warning | `new Error(...)` and `instanceof Error` for recoverable failures — use `Schema.TaggedErrorClass`. |
| [`avoid-yield-ref`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/avoid-yield-ref.md) | warning | Direct `yield* Ref/Deferred/Fiber/Latch` (removed in v4); use explicit method calls. |

### `prefer-*` (7)

| Pattern | Level | Description |
|---|---|---|
| [`prefer-arr-sort`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-arr-sort.md) | warning | `Arr.sort` with explicit `Order` over native `Array.prototype.sort`. |
| [`prefer-duration-values`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-duration-values.md) | warning | `Duration` helpers over numeric literals for time. |
| [`prefer-effect-fn`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-effect-fn.md) | warning | `Effect.fn` for service methods (automatic tracing) over plain `Effect.gen` wrappers. |
| [`prefer-match-over-switch`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-match-over-switch.md) | warning | `Match` over native `switch`. |
| [`prefer-option-over-null`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-option-over-null.md) | info | `Option` over `T \| null` unions. |
| [`prefer-redacted-config`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-redacted-config.md) | warning | `Config.redacted` / `Schema.Redacted` for secrets. |
| [`prefer-schema-class`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/prefer-schema-class.md) | warning | `Schema.Class` over `Schema.Struct` for object/domain schemas. |

### `use-*` (8)

| Pattern | Level | Description |
|---|---|---|
| [`use-clock-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-clock-service.md) | warning | `Clock` / `DateTime` over `new Date(...)` and `Date.*` statics. |
| [`use-command-executor-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-command-executor-service.md) | warning | `ChildProcessSpawner` / `CommandExecutor` over `node:child_process`. |
| [`use-console-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-console-service.md) | warning | `Console` / `Effect.log*` over `console.*`. |
| [`use-filesystem-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-filesystem-service.md) | high | `FileSystem` service over direct `node:fs` / `node:fs/promises` imports. |
| [`use-http-client-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-http-client-service.md) | warning | Effect `HttpClient` over `node:http` / `node:https`. |
| [`use-path-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-path-service.md) | warning | `Path` service over direct `node:path` imports. |
| [`use-random-service`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-random-service.md) | warning | `Random` service over `Math.random()`. |
| [`use-temp-file-scoped`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/use-temp-file-scoped.md) | warning | `makeTempFileScoped` / `makeTempDirectoryScoped` over `os.tmpdir()` or non-scoped variants. |

### Other (11)

| Pattern | Level | Description |
|---|---|---|
| [`casting-awareness`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/casting-awareness.md) | info | Type assertions in general — use type-safe alternatives. |
| [`context-tag-extends`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/context-tag-extends.md) | warning | `Context.Tag`, `Effect.Service`, and legacy `ServiceMap.*` APIs — use `Context.Service`. |
| [`effect-catchall-default`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/effect-catchall-default.md) | warning | Broad `Effect.catch` defaults in domain logic — use `catchTag` unless it's an explicit boundary fallback. |
| [`effect-promise-vs-trypromise`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/effect-promise-vs-trypromise.md) | warning | `Effect.promise` over `Effect.tryPromise` (loses error handling). |
| [`effect-run-in-body`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/effect-run-in-body.md) | warning | `Effect.runSync` / `runPromise` outside entry points. |
| [`imperative-loops`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/imperative-loops.md) | warning | `for` / `for...of` / `while` / `do...while` loops — use functional transformations or `Effect.forEach`. |
| [`require-effect-concurrency`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/require-effect-concurrency.md) | warning | `Effect.forEach` / `all` / `validate` without explicit concurrency on non-trivial fan-out. |
| [`stream-large-files`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/stream-large-files.md) | info | Whole-file reads when the path looks large or unbounded. |
| [`throw-in-effect-gen`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/throw-in-effect-gen.md) | **critical** | `throw` inside `Effect.gen` — use `yield* Effect.fail()`. |
| [`vm-in-wrong-file`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/vm-in-wrong-file.md) | **critical** | View Model definitions outside `.vm.ts` files. |
| [`yield-in-for-loop`](https://github.com/mpsuesser/pi-effect-harness/blob/main/harnesses/effect/patterns/yield-in-for-loop.md) | warning | `yield*` in `for` loops — use `Effect.forEach` / `STM.forEach`. |

Each pattern's full markdown body — usually a Haskell-style transformation diagram, rationale, and a hint to load specific `effect-*` skills — is what gets sent back to the agent on a match.

---

## Configuration

### Reference clone location and refresh

The reference clone is hardcoded to `~/.cache/effect-v4/` (`path.join(os.homedir(), '.cache', 'effect-v4')`). It is shared across every project on the machine — and across both the Pi and OpenCode adapters. The plugin does not read `node_modules/effect/package.json`, does not compute an `effect@<version>` tag, and does not create project-local reference directories.

When Effect mode is enabled, the `session.created` event and per-turn `experimental.chat.system.transform` hook ensure the cache exists and refresh existing clones to the latest Effect v4 beta source in `Effect-TS/effect-smol`.

### Mode persistence

Per-project mode state is stored as JSON at:

```
~/.cache/opencode-effect-harness/projects/<projectID>/mode.json
```

Keyed by `project.id` from `PluginInput.project`. Toggling in project A does not affect project B. The harness has no global "disable" — it is per-project.

### Session-state location

Loaded-skill state for each session is stored as a sidecar JSON at:

```
~/.cache/opencode-effect-harness/sessions/<sessionID>.json
```

Cleared on `session.compacted`. Not currently overridable; would be a future enhancement.

### Skill threshold

`MIN_EFFECT_SKILLS = 7`, defined in `harnesses/effect/src/constants.ts`. Not currently configurable per-project; if you want a different threshold, fork.

### Effect-code regex

```
\bEffect\b|from\s+['"]effect(?:\/[^'"]*)?['"]
```

Matches an `Effect` identifier or any `from "effect..."` import. The gate is intentionally permissive — false positives on the gate are safe (the agent reads more skills); false negatives are not.

### What this plugin never does

- Modifies application source files directly. It only writes to `~/.cache/opencode-effect-harness/` (mode state, session state) and `~/.cache/effect-v4/` (reference clone).
- Blocks Read tool calls. The gate fires on writes only.
- Persists state across projects. Mode is project-scoped; session state is session-scoped.
- Calls the network outside `git clone` / `git fetch` for the reference repo.
- Registers OpenCode hooks beyond those listed in [Lifecycle](#lifecycle): `config`, `experimental.chat.system.transform`, `tool.execute.before`, `tool.execute.after`, `command.execute.before`, and the `session.created` / `session.compacted` events.

---

## Caveats

- **Beta on beta.** Effect v4 is itself in beta, and so is this harness. Keep your project dependency current deliberately. The reference clone tracks the latest Effect v4 beta source rather than any project-local dependency version, so still trust typecheck/tests for ABI compatibility.
- **The patterns are tripwires, not a linter.** They catch the common v3 → v4 confusions and the most expensive-to-debug Effect-specific mistakes. They do not replace `bun run check && bun run test`. Treat a clean pattern run as "the agent didn't trigger the obvious traps," not as "the code is correct."
- **The skill gate is session-scoped.** `/compact` resets the loaded-skill set via the `session.compacted` event. This is deliberate: post-compaction, the agent has a smaller working memory, and re-establishing the relevant skill context is cheaper than letting it write Effect code from a partial summary. The harness does NOT carry the skill count across sessions — each new session ID starts at zero.
- **First cache creation and refresh require git on PATH and network access.** If clone/refresh fails, the harness continues without blocking the agent. The policy header still points at the cache path; re-toggling `/toggle-effect-harness` or starting the next turn retries.
- **The pattern-feedback loop runs after every successful write.** On a large refactor the agent may receive several pattern-feedback messages in a row. This is by design — each one is severity-sorted and de-duplicated, but the rate is determined by the rate of writes.
- **Pattern feedback shows up as a user turn.** Unlike Pi's `Decision.InjectUserMessage` (invisible), OpenCode's `client.session.prompt` produces a visible user-side turn in the transcript. Cosmetically louder; functionally identical.
- **`config.skills.paths` is not yet typed.** The plugin's `config` hook pushes the skills directory onto `config.skills.paths`, a server-side feature that's not yet typed in `@opencode-ai/sdk@1.15.0` but exists at runtime. If the OpenCode SDK ships breaking changes here, the catalog registration may need to be revisited.
- **Skill catalog is filesystem-driven.** The harness rebuilds its skill catalog by globbing `harnesses/effect/skills/`, not by querying OpenCode's command discovery. The two views are kept in sync because the same directory is registered with OpenCode and read by the harness.

---

## Development

```sh
bun install
bun run check                          # dprint format + oxlint + tsgo typecheck
bun run test                           # vitest run (all tests)
bun run build:publishable:opencode     # build the OpenCode plugin tarball
```

The published package follows the layout described in [`docs/specs/2026-05-15-opencode-effect-harness-cutover-design.md`](../../docs/specs/2026-05-15-opencode-effect-harness-cutover-design.md): top-level `opencode/plugin.js` plus `harnesses/effect/{skills,patterns,guidance}/` mirroring the workspace structure so the plugin's relative-path math works identically in dev and prod.

See [`AGENTS.md`](../../AGENTS.md) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for project structure, code style, and PR guidelines.

The plugin is built on a small internal kernel (`packages/harness-kit`) that wraps OpenCode's plugin hook API in Effect — `Decision`, `HarnessRule`, `HookSet`, `RuleEngine`, `WriteProjection`, `PatternCatalog`, `PatternMatcher`. The same kernel powers `pi-effect-harness`; the only host-specific code is the adapter glue under `packages/harness-kit/src/kernel/adapters/opencode/` and `harnesses/effect/src/hooks/opencode/`, plus the entrypoint at `opencode/plugin.ts`.

---

## License

[MIT](https://github.com/typedrat/pi-effect-harness/blob/main/LICENSE) © Marc Suesser; OpenCode adapter © typedrat

---

- [OpenCode](https://opencode.ai) — the coding agent this plugin plugs into.
- [Effect](https://effect.website) — what this plugin is opinionated about.
- [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) — the source the reference clone tracks.
- [Kit Langton (@kitlangton)](https://x.com/kitlangton/status/2016945444312498340) — primary source for the "near-inexpressible majesty of layers" guidance essay.
- [`kriegcloud/beep-effect`](https://github.com/kriegcloud/beep-effect/blob/main/standards/effect-first-development.md) — the earliest version of the `effect-first-development` guidance doc was sourced from here.
