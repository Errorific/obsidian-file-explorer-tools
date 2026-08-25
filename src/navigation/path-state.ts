import type { ExplorerItemSnapshot } from '../explorer/adapter-types';

export function getAncestorFolderPaths(path: string): string[] {
	const result: string[] = [];
	let separatorIndex = path.indexOf('/');
	while (separatorIndex >= 0) {
		result.push(path.slice(0, separatorIndex));
		separatorIndex = path.indexOf('/', separatorIndex + 1);
	}
	return result;
}

export function getFoldersToCollapse(
	items: readonly ExplorerItemSnapshot[],
	retainedPath: string,
	preserveDescendants: boolean,
): string[] {
	return items
		.filter(
			(item) =>
				item.folder &&
				item.collapsed === false &&
				!isAncestor(item.path, retainedPath) &&
				!(preserveDescendants && isDescendant(item.path, retainedPath)),
		)
		.map((item) => item.path);
}

function isAncestor(path: string, descendant: string): boolean {
	return path === '' || path === descendant || descendant.startsWith(`${path}/`);
}

function isDescendant(path: string, ancestor: string): boolean {
	return ancestor === '' || path.startsWith(`${ancestor}/`);
}
