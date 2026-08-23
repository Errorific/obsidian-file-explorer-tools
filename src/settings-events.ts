import type { FileExplorerToolsSettings, FolderConfiguration } from './settings';

export function applyRename(
	settings: FileExplorerToolsSettings,
	oldPath: string,
	newPath: string,
): boolean {
	if (oldPath === newPath) {
		return false;
	}

	let changed = moveHiddenPaths(settings, oldPath, newPath);
	changed = moveFolderConfigurations(settings, oldPath, newPath) || changed;
	changed = movePrefixEntry(settings, oldPath, newPath) || changed;
	return changed;
}

export function applyDelete(
	settings: FileExplorerToolsSettings,
	path: string,
): boolean {
	const hiddenPaths = settings.hiddenPaths.filter(
		(hiddenPath) => !isPathOrDescendant(hiddenPath, path),
	);
	let changed = hiddenPaths.length !== settings.hiddenPaths.length;
	settings.hiddenPaths = hiddenPaths;

	for (const folderPath of Object.keys(settings.folders)) {
		if (isPathOrDescendant(folderPath, path)) {
			delete settings.folders[folderPath];
			changed = true;
		}
	}

	const parentPath = parentOf(path);
	const configuration = settings.folders[parentPath];
	if (configuration !== undefined) {
		const itemName = nameOf(path);
		const nextPrefix = configuration.orderedPrefix.filter(
			(name) => name !== itemName,
		);
		if (nextPrefix.length !== configuration.orderedPrefix.length) {
			configuration.orderedPrefix = nextPrefix;
			removeEmptyConfiguration(settings, parentPath, configuration);
			changed = true;
		}
	}

	return changed;
}

function moveHiddenPaths(
	settings: FileExplorerToolsSettings,
	oldPath: string,
	newPath: string,
): boolean {
	let changed = false;
	settings.hiddenPaths = settings.hiddenPaths.map((path) => {
		if (!isPathOrDescendant(path, oldPath)) {
			return path;
		}
		changed = true;
		return replacePathPrefix(path, oldPath, newPath);
	});
	return changed;
}

function moveFolderConfigurations(
	settings: FileExplorerToolsSettings,
	oldPath: string,
	newPath: string,
): boolean {
	let changed = false;
	const folders: Record<string, FolderConfiguration> = {};
	for (const [path, configuration] of Object.entries(settings.folders)) {
		if (isPathOrDescendant(path, oldPath)) {
			folders[replacePathPrefix(path, oldPath, newPath)] = configuration;
			changed = true;
		} else {
			folders[path] = configuration;
		}
	}
	settings.folders = folders;
	return changed;
}

function movePrefixEntry(
	settings: FileExplorerToolsSettings,
	oldPath: string,
	newPath: string,
): boolean {
	const oldParentPath = parentOf(oldPath);
	const newParentPath = parentOf(newPath);
	const oldName = nameOf(oldPath);
	const newName = nameOf(newPath);
	const oldConfiguration = settings.folders[oldParentPath];
	const prefixIndex = oldConfiguration?.orderedPrefix.indexOf(oldName) ?? -1;
	if (oldConfiguration === undefined || prefixIndex < 0) {
		return false;
	}

	if (oldParentPath === newParentPath) {
		oldConfiguration.orderedPrefix[prefixIndex] = newName;
		return true;
	}

	oldConfiguration.orderedPrefix.splice(prefixIndex, 1);
	removeEmptyConfiguration(settings, oldParentPath, oldConfiguration);
	const newConfiguration = settings.folders[newParentPath] ?? {
		orderedPrefix: [],
	};
	settings.folders[newParentPath] = newConfiguration;
	if (!newConfiguration.orderedPrefix.includes(newName)) {
		newConfiguration.orderedPrefix.push(newName);
	}
	return true;
}

function removeEmptyConfiguration(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	configuration: FolderConfiguration,
): void {
	if (configuration.orderedPrefix.length === 0 && configuration.sortMode === undefined) {
		delete settings.folders[folderPath];
	}
}

function isPathOrDescendant(path: string, ancestorPath: string): boolean {
	return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
}

function replacePathPrefix(
	path: string,
	oldPath: string,
	newPath: string,
): string {
	return `${newPath}${path.slice(oldPath.length)}`;
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}

function nameOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
}
