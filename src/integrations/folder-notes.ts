import type { App, TFile } from 'obsidian';

const FOLDER_NAME_MARKER = '{{folder_name}}';

type StorageLocation = 'insideFolder' | 'parentFolder';

export interface FolderNoteIntegration {
	getAssociatedFolderPath(file: TFile): string | null;
}

interface FolderNotesSettings {
	folderNoteName: string;
	storageLocation: StorageLocation;
}

export function createFolderNoteIntegration(app: App): FolderNoteIntegration | null {
	try {
		const appRecord = app as unknown as Record<string, unknown>;
		const plugins = readRecord(appRecord.plugins);
		if (!isPluginEnabled(plugins)) {
			return null;
		}
		const plugin = readFolderNotesPlugin(plugins);
		const settings = readSettings(plugin?.settings);
		const vault = readRecord(appRecord.vault);
		const getAbstractFileByPath = vault?.getAbstractFileByPath;
		if (settings === null || typeof getAbstractFileByPath !== 'function') {
			return null;
		}

		return {
			getAssociatedFolderPath: (file) => {
				const folderPath = getAssociatedFolderPath(file, settings);
				if (folderPath === null) {
					return null;
				}

				try {
					const folder = readRecord(getAbstractFileByPath.call(vault, folderPath));
					return Array.isArray(folder?.children) ? folderPath : null;
				} catch {
					return null;
				}
			},
		};
	} catch {
		return null;
	}
}

function isPluginEnabled(plugins: Record<string, unknown> | null): boolean {
	const enabledPlugins = readRecord(plugins?.enabledPlugins);
	const has = enabledPlugins?.has;
	return typeof has !== 'function' || has.call(enabledPlugins, 'folder-notes') === true;
}

function readFolderNotesPlugin(
	plugins: Record<string, unknown> | null,
): Record<string, unknown> | null {
	const getPlugin = plugins?.getPlugin;
	if (typeof getPlugin === 'function') {
		try {
			const plugin = readRecord(getPlugin.call(plugins, 'folder-notes'));
			if (plugin !== null) {
				return plugin;
			}
		} catch {
			// Fall back to the plugin registry when this Obsidian version lacks a usable accessor.
		}
	}
	return readRecord(readRecord(plugins?.plugins)?.['folder-notes']);
}

function readSettings(value: unknown): FolderNotesSettings | null {
	const settings = readRecord(value);
	const folderNoteName = settings?.folderNoteName;
	const storageLocation = settings?.storageLocation;
	if (
		typeof folderNoteName !== 'string' ||
		folderNoteName.trim() === '' ||
		(storageLocation !== 'insideFolder' && storageLocation !== 'parentFolder')
	) {
		return null;
	}
	return { folderNoteName, storageLocation };
}

function getAssociatedFolderPath(
	file: TFile,
	settings: FolderNotesSettings,
): string | null {
	const parentPath = file.parent?.path ?? '';
	if (settings.storageLocation === 'insideFolder') {
		const parentName = nameOf(parentPath);
		const expectedName = settings.folderNoteName.replace(
			FOLDER_NAME_MARKER,
			parentName,
		);
		return file.basename === expectedName ? parentPath : null;
	}

	const folderName = extractFolderName(settings.folderNoteName, file.basename);
	if (folderName === null) {
		return null;
	}
	return parentPath === '' ? folderName : `${parentPath}/${folderName}`;
}

function extractFolderName(template: string, basename: string): string | null {
	const markerIndex = template.indexOf(FOLDER_NAME_MARKER);
	if (
		markerIndex < 0 ||
		template.indexOf(FOLDER_NAME_MARKER, markerIndex + FOLDER_NAME_MARKER.length) >= 0
	) {
		return null;
	}
	const prefix = template.slice(0, markerIndex);
	const suffix = template.slice(markerIndex + FOLDER_NAME_MARKER.length);
	if (!basename.startsWith(prefix) || !basename.endsWith(suffix)) {
		return null;
	}
	const end = suffix === '' ? basename.length : -suffix.length;
	const name = basename.slice(prefix.length, end);
	return name === '' ? null : name;
}

function nameOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null
		? (value as Record<string, unknown>)
		: null;
}
