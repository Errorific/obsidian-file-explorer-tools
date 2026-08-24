import { describe, expect, it } from 'vitest';
import {
	createLeafState,
	moveTemporaryVisibility,
	resetTemporaryVisibility,
} from './leaf-state';

describe('explorer leaf state', () => {
	it('moves temporary visibility for renamed paths and descendants', () => {
		const state = createLeafState();
		state.temporaryVisiblePaths.add('Projects');
		state.temporaryVisiblePaths.add('Projects/Current.md');
		state.temporaryVisiblePaths.add('Other.md');

		moveTemporaryVisibility(state, 'Projects', 'Work');

		expect(state.temporaryVisiblePaths).toEqual(
			new Set(['Other.md', 'Work', 'Work/Current.md']),
		);
	});

	it('resets temporary visibility', () => {
		const state = createLeafState();
		state.temporaryVisiblePaths.add('Projects');

		resetTemporaryVisibility(state);

		expect(state.temporaryVisiblePaths).toEqual(new Set());
	});
});
