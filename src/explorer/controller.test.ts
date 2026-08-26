import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import type { FileExplorerToolsSettings } from '../settings';
import { FakeVault } from '../testing/vault-fakes';
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
	const collapse = vi.fn(() => true);
	const expand = vi.fn(() => true);
	const isItemVisible = vi.fn(() => false);
	const refreshToolbarActions = vi.fn();
	const scrollTo = vi.fn(() => true);
	const select = vi.fn(() => true);
	const adapter: ExplorerAdapter = {
		addToolbarAction,
		collapse,
		expand,
		getCompatibilityReport,
		getItems: vi.fn(() => []),
		setItemVisibility: vi.fn(() => true),
		getSortMode,
		installSorting,
		isItemVisible,
		observeRenders: vi.fn(() => disposeObserver),
		refreshToolbarActions,
		runOriginalSort,
		scrollTo,
		select,
		...overrides,
	};
	return {
		actions,
		adapter,
		collapse,
		disposeObserver,
		disposeToolbar,
		expand,
		installSorting,
		isItemVisible,
		refreshToolbarActions,
		runOriginalSort,
		scrollTo,
		select,
	};
}

function createFile(path: string): TFile {
	const vault = new FakeVault();
	const separatorIndex = path.lastIndexOf('/');
	if (separatorIndex >= 0) {
		vault.createFolder(path.slice(0, separatorIndex));
	}
	return vault.createFile(path);
}

function createHost(initialLeaves: ExplorerLeaf[], initialActiveFile: TFile | null = null) {
	let leaves = initialLeaves;
	let activeFile = initialActiveFile;
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
				getActiveFile: () => activeFile,
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
		setActiveFile: (file: TFile | null) => {
			activeFile = file;
		},
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
		expect(first.actions.map(({ title }) => title)).toEqual([
			'Toggle hidden items',
			'Locate current file',
			'Toggle force global sorting',
		]);
		first.actions
			.find((action) => action.title === 'Toggle force global sorting')
			?.callback();

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
		actions
			.find((action) => action.title === 'Toggle hidden items')
			?.callback();

		expect(setItemVisibility).toHaveBeenLastCalledWith('Private.md', {
			hidden: true,
			showHidden: true,
			dimmed: true,
			marked: true,
		});
	});

	it('temporarily reveals a hidden folder associated with the active note', () => {
		const activeFile = createFile('Projects/Active.md');
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf], activeFile);
		const hiddenSettings = {
			...settings,
			hiddenPaths: ['Projects', 'Projects/Active'],
		};
		const setItemVisibility = vi.fn(() => true);
		const { adapter } = createAdapter({
			getItems: vi.fn(() => [
				{
					path: 'Projects',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{
					path: 'Projects/Active',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{
					path: activeFile.path,
					folder: false,
					collapsed: null,
					selected: true,
				},
			]),
			setItemVisibility,
		});
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			folderNotes: { getAssociatedFolderPath: () => 'Projects/Active' },
			getSettings: () => hiddenSettings,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();

		expect(setItemVisibility).toHaveBeenCalledWith('Projects', {
			hidden: true,
			showHidden: true,
			dimmed: true,
			marked: true,
		});
		expect(setItemVisibility).toHaveBeenCalledWith('Projects/Active', {
			hidden: true,
			showHidden: true,
			dimmed: true,
			marked: true,
		});
	});

	it('dims the visible subtree of a revealed hidden folder', () => {
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf]);
		const hiddenSettings = { ...settings, hiddenPaths: ['Private'] };
		const setItemVisibility = vi.fn(() => true);
		const { adapter, actions } = createAdapter({
			getItems: vi.fn(() => [
				{
					path: 'Private',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{
					path: 'Private/Note.md',
					folder: false,
					collapsed: null,
					selected: false,
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
		actions
			.find((action) => action.title === 'Toggle hidden items')
			?.callback();

		expect(setItemVisibility).toHaveBeenLastCalledWith('Private/Note.md', {
			hidden: false,
			showHidden: true,
			dimmed: true,
			marked: false,
		});
	});

	it('toggles hidden items in every explorer from a command', () => {
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, triggerLayoutReady } = createHost([firstLeaf, secondLeaf]);
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
		controller.toggleHiddenItems();

		expect(first.refreshToolbarActions).toHaveBeenCalledOnce();
		expect(second.refreshToolbarActions).toHaveBeenCalledOnce();
		expect(
			first.actions.find((action) => action.title === 'Toggle hidden items')
				?.getPressed?.(),
		).toBe(true);
		expect(
			second.actions.find((action) => action.title === 'Toggle hidden items')
				?.getPressed?.(),
		).toBe(true);
	});

	it('locates the active file in every explorer from a command', () => {
		const activeFile = createFile('Projects/Active/Plan.md');
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, triggerLayoutReady } = createHost(
			[firstLeaf, secondLeaf],
			activeFile,
		);
		const items = [
			{ path: 'Projects', folder: true, collapsed: true, selected: false },
			{
				path: 'Projects/Active',
				folder: true,
				collapsed: true,
				selected: false,
			},
			{
				path: activeFile.path,
				folder: false,
				collapsed: null,
				selected: false,
			},
		];
		const first = createAdapter({ getItems: vi.fn(() => items) });
		const second = createAdapter({ getItems: vi.fn(() => items) });
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
		controller.locateCurrentFile();

		for (const adapter of [first, second]) {
			expect(adapter.expand).toHaveBeenCalledWith('Projects');
			expect(adapter.expand).toHaveBeenCalledWith('Projects/Active');
			expect(adapter.scrollTo).toHaveBeenCalledWith(activeFile.path);
			expect(adapter.select).toHaveBeenCalledWith(activeFile.path);
		}
	});

	it('targets only its explorer from the locate toolbar action', () => {
		const activeFile = createFile('Plan.md');
		const firstLeaf = { view: { id: 'first' } };
		const secondLeaf = { view: { id: 'second' } };
		const { host, triggerLayoutReady } = createHost(
			[firstLeaf, secondLeaf],
			activeFile,
		);
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
		first.actions
			.find((action) => action.title === 'Locate current file')
			?.callback();

		expect(first.scrollTo).toHaveBeenCalledWith(activeFile.path);
		expect(second.scrollTo).not.toHaveBeenCalled();
	});

	it('collapses unrelated folders when the selected active file is visible', () => {
		const activeFile = createFile('Projects/Active/Plan.md');
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf], activeFile);
		const collapse = vi.fn(() => true);
		const scrollTo = vi.fn(() => true);
		const select = vi.fn(() => true);
		const { adapter } = createAdapter({
			collapse,
			getItems: vi.fn(() => [
				{ path: 'Projects', folder: true, collapsed: false, selected: false },
				{
					path: 'Projects/Active',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{ path: 'Archive', folder: true, collapsed: false, selected: false },
				{
					path: activeFile.path,
					folder: false,
					collapsed: null,
					selected: true,
				},
			]),
			isItemVisible: vi.fn(() => true),
			scrollTo,
			select,
		});
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		controller.locateCurrentFile();

		expect(collapse).toHaveBeenCalledOnce();
		expect(collapse).toHaveBeenCalledWith('Archive');
		expect(scrollTo).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	});

	it('locates a selected active file again when it is off-screen', () => {
		const activeFile = createFile('Plan.md');
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf], activeFile);
		const collapse = vi.fn(() => true);
		const scrollTo = vi.fn(() => true);
		const select = vi.fn(() => true);
		const { adapter } = createAdapter({
			collapse,
			getItems: vi.fn(() => [
				{ path: 'Archive', folder: true, collapsed: false, selected: false },
				{
					path: activeFile.path,
					folder: false,
					collapsed: null,
					selected: true,
				},
			]),
			isItemVisible: vi.fn(() => false),
			scrollTo,
			select,
		});
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		controller.locateCurrentFile();

		expect(scrollTo).toHaveBeenCalledWith(activeFile.path);
		expect(select).toHaveBeenCalledWith(activeFile.path);
		expect(collapse).not.toHaveBeenCalled();
	});

	it('preserves an associated folder subtree during explicit collapse', () => {
		const activeFile = createFile('Projects/Active.md');
		const leaf = { view: {} };
		const { host, triggerLayoutReady } = createHost([leaf], activeFile);
		const collapse = vi.fn(() => true);
		const { adapter } = createAdapter({
			collapse,
			getItems: vi.fn(() => [
				{ path: 'Projects', folder: true, collapsed: false, selected: false },
				{
					path: 'Projects/Active',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{
					path: 'Projects/Active/Research',
					folder: true,
					collapsed: false,
					selected: false,
				},
				{ path: 'Archive', folder: true, collapsed: false, selected: false },
			]),
		});
		const controller = new ExplorerController(host, {
			createAdapter: () => adapter,
			folderNotes: { getAssociatedFolderPath: () => 'Projects/Active' },
			showNotice: vi.fn(),
		});

		controller.start();
		triggerLayoutReady();
		controller.collapseToCurrentPath();

		expect(collapse).toHaveBeenCalledOnce();
		expect(collapse).toHaveBeenCalledWith('Archive');
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
