import type { FileExplorerToolsSettings } from '../settings';

export function isHidden(
	settings: Pick<FileExplorerToolsSettings, 'hiddenPaths'>,
	path: string,
): boolean {
	return settings.hiddenPaths.includes(path);
}

export function setHidden(
	settings: FileExplorerToolsSettings,
	path: string,
	hidden: boolean,
): boolean {
	const index = settings.hiddenPaths.indexOf(path);
	if (hidden) {
		if (index >= 0) {
			return false;
		}
		settings.hiddenPaths.push(path);
		return true;
	}
	if (index < 0) {
		return false;
	}
	settings.hiddenPaths.splice(index, 1);
	return true;
}

export function isTemporarilyVisible(
	temporaryVisiblePaths: ReadonlySet<string>,
	path: string,
): boolean {
	return temporaryVisiblePaths.has(path);
}

export function pathsToReveal(
	path: string,
	settings: Pick<FileExplorerToolsSettings, 'hiddenPaths'>,
): string[] {
	const result: string[] = [];
	let current = path;
	while (true) {
		if (settings.hiddenPaths.includes(current)) {
			result.unshift(current);
		}
		const separator = current.lastIndexOf('/');
		if (separator < 0) {
			break;
		}
		current = current.slice(0, separator);
	}
	return result;
}

export function clearTemporaryVisibility(
	temporaryVisiblePaths: Set<string>,
): void {
	temporaryVisiblePaths.clear();
}
