import { Context, Effect, FileSystem, Layer, Path, Ref, Schema } from 'effect';

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
			Effect.gen(function*() {
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
					Effect.gen(function*() {
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
					Effect.gen(function*() {
						const map = yield* Ref.get(cache);
						const cached = map.get(sessionId);
						if (cached !== undefined) {
							return cached;
						}
						const loaded = yield* loadFromDisk(sessionId);
						yield* Ref.update(
							cache,
							(m) => new Map(m).set(sessionId, loaded)
						);
						return loaded;
					});

				const writeToDisk = (
					sessionId: string,
					skills: ReadonlySet<string>
				) => Effect.gen(function*() {
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
					yield* fs.writeFileString(tmp, content).pipe(
						Effect.orElseSucceed(() => undefined)
					);
					yield* fs.rename(tmp, file).pipe(
						Effect.orElseSucceed(() => undefined)
					);
				});

				const recordSkillLoad: Interface['recordSkillLoad'] = (
					sessionId,
					name
				) => Effect.gen(function*() {
					const current = new Set(yield* get(sessionId));
					if (current.has(name)) {
						return;
					}
					current.add(name);
					yield* Ref.update(
						cache,
						(m) => new Map(m).set(sessionId, current)
					);
					yield* writeToDisk(sessionId, current);
				});

				const getLoadedSkills: Interface['getLoadedSkills'] = (
					sessionId
				) => Effect.map(
					get(sessionId),
					(s) => s as ReadonlySet<string>
				);

				const clearSession: Interface['clearSession'] = (sessionId) =>
					Effect.gen(function*() {
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
