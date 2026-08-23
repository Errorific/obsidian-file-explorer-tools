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
