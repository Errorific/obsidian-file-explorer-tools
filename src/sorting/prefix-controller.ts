import type { FileExplorerToolsSettings } from '../settings';

export function addPrefixItem(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	itemName: string,
): void {
	const configuration = settings.folders[folderPath] ?? { orderedPrefix: [] };
	settings.folders[folderPath] = configuration;
	if (!configuration.orderedPrefix.includes(itemName)) {
		configuration.orderedPrefix.push(itemName);
	}
}

export function removePrefixItem(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	itemName: string,
): void {
	const configuration = settings.folders[folderPath];
	if (configuration === undefined) {
		return;
	}

	configuration.orderedPrefix = configuration.orderedPrefix.filter(
		(name) => name !== itemName,
	);
	if (configuration.orderedPrefix.length === 0 && configuration.sortMode === undefined) {
		delete settings.folders[folderPath];
	}
}

export function movePrefixItem(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	itemName: string,
	offset: -1 | 1,
): boolean {
	const prefix = settings.folders[folderPath]?.orderedPrefix;
	if (prefix === undefined) {
		return false;
	}

	const currentIndex = prefix.indexOf(itemName);
	const nextIndex = currentIndex + offset;
	if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prefix.length) {
		return false;
	}

	prefix.splice(currentIndex, 1);
	prefix.splice(nextIndex, 0, itemName);
	return true;
}
