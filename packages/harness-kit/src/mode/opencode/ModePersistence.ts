import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';

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
			Effect.gen(function*() {
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
					Effect.gen(function*() {
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
					Effect.gen(function*() {
						const file = filePathFor(projectId);
						yield* fs.makeDirectory(path.dirname(file), {
							recursive: true
						}).pipe(Effect.orElseSucceed(() => undefined));
						const content = encode(
							new PersistedModeState({ version: 1, enabled })
						);
						const tmp = `${file}.tmp`;
						yield* fs.writeFileString(tmp, content).pipe(
							Effect.orElseSucceed(() => undefined)
						);
						yield* fs.rename(tmp, file).pipe(
							Effect.orElseSucceed(() => undefined)
						);
					});

				return Service.of({ load, save });
			})
		);
}
