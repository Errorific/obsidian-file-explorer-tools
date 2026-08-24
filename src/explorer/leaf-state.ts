import { clearTemporaryVisibility } from '../hiding/hidden-items';

export interface ExplorerLeafState {
	showHidden: boolean;
	temporaryVisiblePaths: Set<string>;
}

export function createLeafState(): ExplorerLeafState {
	return { showHidden: false, temporaryVisiblePaths: new Set() };
}

export function resetTemporaryVisibility(state: ExplorerLeafState): void {
	clearTemporaryVisibility(state.temporaryVisiblePaths);
}

export function moveTemporaryVisibility(
	state: ExplorerLeafState,
	oldPath: string,
	newPath: string,
): void {
	const paths = [...state.temporaryVisiblePaths];
	for (const path of paths) {
		if (path !== oldPath && !path.startsWith(`${oldPath}/`)) {
			continue;
		}
		state.temporaryVisiblePaths.delete(path);
		state.temporaryVisiblePaths.add(
			`${newPath}${path.slice(oldPath.length)}`,
		);
	}
}
