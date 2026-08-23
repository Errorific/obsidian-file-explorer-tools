import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import type { FileExplorerToolsSettings } from '../settings';
import type { ExplorerAdapter, ToolbarAction } from './adapter-types';
import {
	ExplorerController,
	type ExplorerLeaf,
	type ExplorerPluginHost,
} from './controller';

const settings: FileExplorerToolsSettings = {
	schemaVersion: 1,
	mixFilesAndFolders: false,
	hiddenPaths: [],
	folders: {},
};

function createAdapter(overrides: Partial<ExplorerAdapter> = {}) {
	const actions: ToolbarAction[] = [];
	const disposeObserver = vi.fn();
	const disposeToolbar = vi.fn();
	const getCompatibilityReport: ExplorerAdapter['getCompatibilityReport'] =
		vi.fn<ExplorerAdapter['getCompatibilityReport']>(() => ({
			available: true,
			unavailableCapabilities: [],
			itemCount: 1,
			sortMode: 'alphabetical',
		}));
	const getSortMode: ExplorerAdapter['getSortMode'] =
		vi.fn<ExplorerAdapter['getSortMode']>(() => 'alphabetical');
	const installSorting: ExplorerAdapter['installSorting'] = vi.fn(() => vi.fn());
	const runOriginalSort: ExplorerAdapter['runOriginalSort'] = vi.fn(() => true);
	const addToolbarAction: ExplorerAdapter['addToolbarAction'] = vi.fn(
		(action: ToolbarAction) => {
			actions.push(action);
			return disposeToolbar;
		},
	);
	const adapter: ExplorerAdapter = {
		addToolbarAction,
		collapse: vi.fn(() => true),
		expand: vi.fn(() => true),
		getCompatibilityReport,
		getItems: vi.fn(() => []),
		setItemVisibility: vi.fn(() => true),
		getSortMode,
		installSorting,
		observeRenders: vi.fn(() => disposeObserver),
		refreshToolbarActions: vi.fn(),
		runOriginalSort,
		scrollTo: vi.fn(() => true),
		select: vi.fn(() => true),
		...overrides,
	};
	return {
		actions,
		adapter,
		disposeObserver,
		disposeToolbar,
		installSorting,
		runOriginalSort,
	};
}

function createHost(initialLeaves: ExplorerLeaf[]) {
	let leaves = initialLeaves;
	let layoutReadyCallback: (() => void) | null = null;
	let layoutChangeCallback: (() => void) | null = null;
	let fileOpenCallback: (() => void) | null = null;
	const getLeavesOfType = vi.fn(() => leaves);
	const onLayoutChange = vi.fn(
		(_name: 'layout-change', callback: () => void) => {
			layoutChangeCallback = callback;
			return {};
		},
	);
	const onLayoutReady = vi.fn((callback: () => void) => {
		layoutReadyCallback = callback;
	});
	const onFileOpen = vi.fn(
		(_name: 'file-open', callback: () => void) => {
			fileOpenCallback = callback;
			return {};
		},
	);
	const registerEvent = vi.fn();
	const host: ExplorerPluginHost = {
		app: {
			workspace: {
				getLeavesOfType,
				getActiveFile: () => null,
				on: (
					name: 'layout-change' | 'file-open',
					callback: (file?: TFile | null) => void,
				) =>
					name === 'layout-change'
						? onLayoutChange(name, callback)
						: onFileOpen(name, callback),
				onLayoutReady,
			},
		},
		registerEvent,
	};
	return {
		host,
		registerEvent,
		setLeaves: (nextLeaves: ExplorerLeaf[]) => {
			leaves = nextLeaves;
		},
		triggerLayoutChange: () => layoutChangeCallback?.(),
		triggerFileOpen: () => fileOpenCallback?.(),
		triggerLayoutReady: () => layoutReadyCallback?.(),
	};
}

describe('ExplorerController', () => {
	it('attaches existing leaves once and disposes their resources', () => {
		const leaf = { view: {} };
		const { host, registerEvent, triggerLayoutReady } = createHost([leaf]);
		const { adapter, disposeObserver, disposeToolbar } = createAdapter();
		const createAdapterForView = vi.fn(() => adapter);
		const controller = new ExplorerController(host, {
			createAdapter: createAdapterForView,
			showNotice: vi.fn(),
		});

		controller.start();
		controller.start();
		triggerLayoutReady();

		expect(createAdapterForView).toHaveBeenCalledOnce();
		expect(createAdapterForView).toHaveBeenCalledWith(leaf.view);
		expect(registerEvent).toHaveBeenCalledTimes(2);

		controller.dispose();
		expect(disposeToolbar).toHaveBeenCalledTimes(3);
		expect(disposeObserver).toHaveBeenCalledOnce();
	});

	it('attaches added leaves and disposes removed leaves', () => {
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, setLeaves, triggerLayoutChange, triggerLayoutReady } =
			createHost([firstLeaf]);
		const first = createAdapter();
		const second = createAdapter();
		const createAdapterForView = vi
			.fn()
			.mockReturnValueOnce(first.adapter)
			.mockReturnValueOnce(second.adapter);
		const controller = new ExplorerController(host, {
			createAdapter: createAdapterForView,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		setLeaves([secondLeaf]);
		triggerLayoutChange();

		expect(first.disposeToolbar).toHaveBeenCalledTimes(3);
		expect(first.disposeObserver).toHaveBeenCalledOnce();
		expect(createAdapterForView).toHaveBeenCalledTimes(2);

		controller.dispose();
		expect(second.disposeToolbar).toHaveBeenCalledTimes(3);
		expect(second.disposeObserver).toHaveBeenCalledOnce();
	});

	it('isolates attachment failures and rolls back partial resources', () => {
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, triggerLayoutReady } = createHost([firstLeaf, secondLeaf]);
		const first = createAdapter({
			getCompatibilityReport: vi.fn(() => {
				throw new Error('incompatible explorer');
			}),
		});
		const second = createAdapter();
		const createAdapterForView = vi
			.fn()
			.mockReturnValueOnce(first.adapter)
			.mockReturnValueOnce(second.adapter);
		const showNotice = vi.fn();
		const controller = new ExplorerController(host, {
			createAdapter: createAdapterForView,
			showNotice,
		});

		controller.start();
		triggerLayoutReady();

		expect(first.disposeToolbar).toHaveBeenCalledTimes(3);
		expect(first.disposeObserver).toHaveBeenCalledOnce();
		expect(createAdapterForView).toHaveBeenCalledTimes(2);
		expect(showNotice).toHaveBeenCalledWith(
			'File Explorer Tools: file explorer compatibility check failed.',
		);

		controller.dispose();
		expect(second.disposeToolbar).toHaveBeenCalledTimes(3);
		expect(second.disposeObserver).toHaveBeenCalledOnce();
	});

	it('continues cleanup when a disposer fails', () => {
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf]);
		const disposeObserver = vi.fn();
		const adapter = createAdapter({
			addToolbarAction: vi.fn(() => () => {
				throw new Error('toolbar cleanup failed');
			}),
			observeRenders: vi.fn(() => disposeObserver),
		}).adapter;
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();

		expect(() => controller.dispose()).not.toThrow();
		expect(disposeObserver).toHaveBeenCalledOnce();
	});

	it('does not attach after being disposed before layout readiness', () => {
		const { host, registerEvent, triggerLayoutReady } = createHost([
			{ view: {} },
		]);
		const createAdapterForView = vi.fn(() => createAdapter().adapter);
		const controller = new ExplorerController(host, {
			createAdapter: createAdapterForView,
			showNotice: vi.fn(),
		});

		controller.start();
		controller.dispose();
		triggerLayoutReady();

		expect(createAdapterForView).not.toHaveBeenCalled();
		expect(registerEvent).not.toHaveBeenCalled();
	});

	it('shares force-global sorting across attached and later leaves', () => {
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, setLeaves, triggerLayoutChange, triggerLayoutReady } =
			createHost([firstLeaf]);
		const first = createAdapter();
		const second = createAdapter();
		const createAdapterForView = vi
			.fn()
			.mockReturnValueOnce(first.adapter)
			.mockReturnValueOnce(second.adapter);
		const controller = new ExplorerController(host, {
			createAdapter: createAdapterForView,
			getSettings: () => settings,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		expect(first.actions).toHaveLength(3);
		first.actions[2]?.callback();

		expect(controller.isForceGlobal()).toBe(true);
		expect(first.runOriginalSort).toHaveBeenCalledTimes(2);

		setLeaves([firstLeaf, secondLeaf]);
		triggerLayoutChange();
		const provider = vi.mocked(second.installSorting).mock.calls[0]?.[0];
		expect(provider?.('', 'alphabetical')).toMatchObject({
			sortMode: 'name-ascending',
			prefixPositions: new Map(),
		});
		expect(second.runOriginalSort).toHaveBeenCalledOnce();
	});

	it('keeps the open hidden file visible when reveal mode is toggled', () => {
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf]);
		const hiddenSettings = { ...settings, hiddenPaths: ['Private.md'] };
		const setItemVisibility = vi.fn(() => true);
		const { adapter, actions } = createAdapter({
			getItems: vi.fn(() => [
				{
					path: 'Private.md',
					folder: false,
					collapsed: null,
					selected: true,
				},
			]),
			setItemVisibility,
		});
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			getSettings: () => hiddenSettings,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		controller.revealPath('Private.md');
		actions[1]?.callback();

		expect(setItemVisibility).toHaveBeenLastCalledWith('Private.md', {
			hidden: true,
			showHidden: true,
		});
	});

	it('reapplies sorting when settings change', () => {
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf]);
		const { adapter, runOriginalSort } = createAdapter();
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			getSettings: () => settings,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		controller.refreshSorting();

		expect(runOriginalSort).toHaveBeenCalledTimes(2);
	});
});
