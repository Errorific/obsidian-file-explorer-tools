import type { App, TFile } from 'obsidian';

export interface FolderNoteIntegration {
	getAssociatedFolderPath(file: TFile): string | null;
}

interface FolderNotesPlugin {
	settings?: {
		folderNoteName?: unknown;
		storageLocation?: unknown;
	};
}

export function createFolderNoteIntegration(app: App): FolderNoteIntegration | null {
	const appRecord = app as unknown as Record<string, unknown>;
	const plugins = readRecord(appRecord.plugins);
	const getPlugin = plugins?.getPlugin;
	const plugin =
		typeof getPlugin === 'function'
			? (readRecord(getPlugin.call(plugins, 'folder-notes')) as FolderNotesPlugin | null)
			: null;
	const settings = plugin?.settings;
	if (
		settings === undefined ||
		typeof settings.folderNoteName !== 'string' ||
		(settings.storageLocation !== 'insideFolder' &&
			settings.storageLocation !== 'parentFolder')
	) {
		return null;
	}

	return {
		getAssociatedFolderPath: (file) => {
			const folderName = extractFolderName(settings.folderNoteName as string, file.basename);
			if (folderName === null) {
				return null;
			}
			const parentPath = file.parent?.path ?? '';
			if (settings.storageLocation === 'insideFolder') {
				return parentPath;
			}
			return parentPath === '' ? folderName : `${parentPath}/${folderName}`;
		},
	};
}

function extractFolderName(template: string, basename: string): string | null {
	const marker = '{{folder_name}}';
	const markerIndex = template.indexOf(marker);
	if (markerIndex < 0) {
		return null;
	}
	const prefix = template.slice(0, markerIndex);
	const suffix = template.slice(markerIndex + marker.length);
	if (!basename.startsWith(prefix) || !basename.endsWith(suffix)) {
		return null;
	}
	const end = suffix === '' ? basename.length : -suffix.length;
	const name = basename.slice(prefix.length, end);
	return name === '' ? null : name;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null
		? (value as Record<string, unknown>)
		: null;
}
