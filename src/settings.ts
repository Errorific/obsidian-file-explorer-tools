import type { TAbstractFile, TFolder, Vault } from 'obsidian';

export const SETTINGS_SCHEMA_VERSION = 1 as const;

export type SortMode =
	| 'name-ascending'
	| 'name-descending'
	| 'modified-ascending'
	| 'modified-descending'
	| 'created-ascending'
	| 'created-descending';

export interface FolderConfiguration {
	[key: string]: unknown;
	sortMode?: SortMode;
	orderedPrefix: string[];
}

export interface FileExplorerToolsSettings {
	[key: string]: unknown;
	schemaVersion: number;
	mixFilesAndFolders: boolean;
	hiddenPaths: string[];
	folders: Record<string, FolderConfiguration>;
}

export const DEFAULT_SETTINGS: Readonly<FileExplorerToolsSettings> = {
	schemaVersion: SETTINGS_SCHEMA_VERSION,
	mixFilesAndFolders: false,
	hiddenPaths: [],
	folders: {},
};

const SORT_MODES = new Set<SortMode>([
	'name-ascending',
	'name-descending',
	'modified-ascending',
	'modified-descending',
	'created-ascending',
	'created-descending',
]);

type SettingsRecord = Record<string, unknown>;

type VaultLookup = Pick<Vault, 'getAbstractFileByPath' | 'getRoot'>;

export interface PreparedSettings {
	settings: FileExplorerToolsSettings;
	needsSave: boolean;
}

export function prepareSettings(data: unknown): PreparedSettings {
	const settings = loadSettings(data);
	return {
		settings,
		needsSave: JSON.stringify(data) !== JSON.stringify(settings),
	};
}

export function loadSettings(data: unknown): FileExplorerToolsSettings {
	return normalizeSettings(migrateSettings(data));
}

export function migrateSettings(data: unknown): SettingsRecord {
	const settings = isRecord(data) ? { ...data } : {};
	const version = readSchemaVersion(settings.schemaVersion);

	if (
		typeof settings.groupFoldersFirst === 'boolean' &&
		typeof settings.mixFilesAndFolders !== 'boolean'
	) {
		settings.mixFilesAndFolders = !settings.groupFoldersFirst;
	}
	delete settings.groupFoldersFirst;
	if (version < 1) {
		settings.schemaVersion = 1;
	}

	return settings;
}

export function reconcileSettings(
	settings: FileExplorerToolsSettings,
	vault: VaultLookup,
): FileExplorerToolsSettings {
	const normalized = loadSettings(settings);
	return {
		...normalized,
		hiddenPaths: normalized.hiddenPaths.filter(
			(path) => vault.getAbstractFileByPath(path) !== null,
		),
		folders: Object.fromEntries(
			Object.entries(normalized.folders).flatMap(([path, configuration]) => {
				const folder = findFolder(vault, path);
				if (folder === null) {
					return [];
				}

				const childNames = new Set(folder.children.map((child) => child.name));
				return [
					[
						path,
						{
							...configuration,
							orderedPrefix: configuration.orderedPrefix.filter((name) =>
								childNames.has(name),
							),
						},
					],
				];
			}),
		),
	};
}

function normalizeSettings(settings: SettingsRecord): FileExplorerToolsSettings {
	const schemaVersion = readSchemaVersion(settings.schemaVersion);
	return {
		...settings,
		schemaVersion:
			schemaVersion === 0 ? SETTINGS_SCHEMA_VERSION : schemaVersion,
		mixFilesAndFolders:
			typeof settings.mixFilesAndFolders === 'boolean'
				? settings.mixFilesAndFolders
				: DEFAULT_SETTINGS.mixFilesAndFolders,
		hiddenPaths: readUniqueStrings(settings.hiddenPaths),
		folders: readFolderConfigurations(settings.folders),
	};
}

function readFolderConfigurations(value: unknown): Record<string, FolderConfiguration> {
	if (!isRecord(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).flatMap(([path, configuration]) => {
			if (!isVaultPath(path, true) || !isRecord(configuration)) {
				return [];
			}

			const sortMode = readSortMode(configuration.sortMode);
			const preservedFields = Object.fromEntries(
				Object.entries(configuration).filter(
					([key]) => key !== 'sortMode' && key !== 'orderedPrefix',
				),
			);
			return [
				[
					path,
					{
						...preservedFields,
						...(sortMode === undefined ? {} : { sortMode }),
						orderedPrefix: readUniqueStrings(configuration.orderedPrefix).filter(
							(name) => !name.includes('/'),
						),
					},
				],
			];
		}),
	);
}

function readSortMode(value: unknown): SortMode | undefined {
	return typeof value === 'string' && SORT_MODES.has(value as SortMode)
		? (value as SortMode)
		: undefined;
}

function readUniqueStrings(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [
		...new Set(
			value.filter(
				(item): item is string =>
					typeof item === 'string' && isVaultPath(item, false),
			),
		),
	];
}

function findFolder(vault: VaultLookup, path: string): TFolder | null {
	const item = path === '' ? vault.getRoot() : vault.getAbstractFileByPath(path);
	return isFolder(item) ? item : null;
}

function isFolder(item: TAbstractFile | null): item is TFolder {
	return item !== null && 'children' in item;
}

function isVaultPath(value: string, allowRoot: boolean): boolean {
	return (
		(allowRoot || value.length > 0) &&
		!value.startsWith('/') &&
		!value.endsWith('/') &&
		!value.includes('//')
	);
}

function readSchemaVersion(value: unknown): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
		? value
		: 0;
}

function isRecord(value: unknown): value is SettingsRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
