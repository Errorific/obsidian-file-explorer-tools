import type { FileExplorerToolsSettings } from '../settings';

export function pinItem(
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

export function reorderPinnedItem(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	itemName: string,
	targetName: string,
	position: 'before' | 'after',
): boolean {
	const prefix = settings.folders[folderPath]?.orderedPrefix;
	if (prefix === undefined) {
		return false;
	}

	const currentIndex = prefix.indexOf(itemName);
	const targetIndex = prefix.indexOf(targetName);
	if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
		return false;
	}

	const reordered = prefix.filter((name) => name !== itemName);
	const adjustedTargetIndex = reordered.indexOf(targetName);
	const insertionIndex =
		position === 'before' ? adjustedTargetIndex : adjustedTargetIndex + 1;
	reordered.splice(insertionIndex, 0, itemName);
	if (reordered.every((name, index) => name === prefix[index])) {
		return false;
	}

	settings.folders[folderPath]!.orderedPrefix = reordered;
	return true;
}

export function unpinItem(
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

export function movePinnedItem(
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
