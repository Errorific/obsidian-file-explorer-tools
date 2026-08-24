import { describe, expect, it, vi } from 'vitest';
import type { ExplorerAdapter, ToolbarAction } from './adapter-types';
import { addCompatibilityAction, formatCompatibilityReport } from './toolbar';

function createAdapter() {
	let action: ToolbarAction | null = null;
	const dispose = vi.fn();
	const addToolbarAction: ExplorerAdapter['addToolbarAction'] =
		vi.fn<ExplorerAdapter['addToolbarAction']>((nextAction) => {
			action = nextAction;
			return dispose;
		});
	const getCompatibilityReport: ExplorerAdapter['getCompatibilityReport'] =
		vi.fn<ExplorerAdapter['getCompatibilityReport']>(() => ({
			available: true,
			unavailableCapabilities: [],
			itemCount: 3,
			sortMode: 'alphabetical',
		}));
	const getSortMode: ExplorerAdapter['getSortMode'] =
		vi.fn<ExplorerAdapter['getSortMode']>(() => 'alphabetical');
	const runOriginalSort = vi.fn(() => true);
	const adapter: ExplorerAdapter = {
		addToolbarAction,
		collapse: vi.fn(() => true),
		expand: vi.fn(() => true),
		getCompatibilityReport,
		getItems: vi.fn(() => []),
		setItemVisibility: vi.fn(() => true),
		getSortMode,
		installSorting: vi.fn(() => vi.fn()),
		observeRenders: vi.fn(() => vi.fn()),
		refreshToolbarActions: vi.fn(),
		runOriginalSort,
		scrollTo: vi.fn(() => true),
		select: vi.fn(() => true),
	};
	return {
		action: () => action,
		adapter,
		dispose,
		runOriginalSort,
	};
}

describe('addCompatibilityAction', () => {
	it('runs core sorting and reports current capabilities', () => {
		const { action, adapter, dispose, runOriginalSort } = createAdapter();
		const showNotice = vi.fn();

		const registeredDispose = addCompatibilityAction(
			adapter,
			() => 2,
			showNotice,
		);
		action()?.callback();

		expect(runOriginalSort).toHaveBeenCalledOnce();
		expect(showNotice).toHaveBeenCalledWith(
			'File Explorer Tools: compatibility check passed. 3 items, 2 renders observed, sort mode alphabetical.',
		);
		expect(registeredDispose).toBe(dispose);
	});
});

describe('formatCompatibilityReport', () => {
	it('lists unavailable capabilities', () => {
		expect(
			formatCompatibilityReport(
				{
					available: false,
					unavailableCapabilities: [
						'run core sorting',
						'scroll to items',
					],
					itemCount: 1,
					sortMode: 'alphabetical',
				},
				0,
			),
		).toBe(
			'File Explorer Tools: unavailable capabilities: run core sorting, scroll to items.',
		);
	});
});
