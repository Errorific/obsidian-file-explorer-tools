import { describe, expect, it, vi } from 'vitest';
import {
	createExplorerAdapter,
	type RenderObserverFactory,
} from './adapter';

interface FakeItem {
	collapsed?: boolean;
	file: { path: string };
	setCollapsed?: ReturnType<typeof vi.fn>;
}

function createView() {
	const fileItem: FakeItem = { file: { path: 'Welcome.md' } };
	const folderItem: FakeItem = {
		collapsed: true,
		file: { path: 'Projects' },
		setCollapsed: vi.fn(function (this: FakeItem, collapsed: boolean) {
			this.collapsed = collapsed;
		}),
	};
	const selected = new Set<FakeItem>();
	const toolbarElement = { remove: vi.fn() };
	const view = {
		addAction: vi.fn(() => toolbarElement),
		fileItems: {
			'Welcome.md': fileItem,
			Projects: folderItem,
		},
		getSortedFolderItems: vi.fn(
			(folder: { path?: string; children: unknown[] }) => [...folder.children],
		),
		navFileContainerEl: { nodeType: 1 },
		sort: vi.fn(),
		sortOrder: 'alphabetical',
		tree: {
			clearSelectedDoms: vi.fn(() => selected.clear()),
			infinityScroll: {
				scrollIntoView: vi.fn(),
			},
			selectItem: vi.fn((item: FakeItem) => selected.add(item)),
			selectedDoms: selected,
			setFocusedItem: vi.fn(),
		},
	};

	return { fileItem, folderItem, selected, toolbarElement, view };
}

function createObserverFactory() {
	let callback: MutationCallback | null = null;
	const disconnect = vi.fn();
	const observe = vi.fn();
	const observer: MutationObserver = {
		disconnect,
		observe,
		takeRecords: vi.fn(() => []),
	};
	const factory: RenderObserverFactory = vi.fn(
		(nextCallback: MutationCallback) => {
			callback = nextCallback;
			return observer;
		},
	);
	return {
		disconnect,
		factory,
		observe,
		observer,
		trigger: () => callback?.([], observer),
	};
}

describe('createExplorerAdapter', () => {
	it('reports all expected explorer capabilities', () => {
		const { view } = createView();
		const adapter = createExplorerAdapter(view);

		expect(adapter.getCompatibilityReport()).toEqual({
			available: true,
			unavailableCapabilities: [],
			itemCount: 2,
			sortMode: 'alphabetical',
		});
		expect(adapter.getItems()).toEqual([
			{
				path: 'Welcome.md',
				folder: false,
				collapsed: null,
				selected: false,
			},
			{
				path: 'Projects',
				folder: true,
				collapsed: true,
				selected: false,
			},
		]);
	});

	it('reports incompatible structures without throwing', () => {
		const adapter = createExplorerAdapter({});

		expect(adapter.getCompatibilityReport()).toEqual({
			available: false,
			unavailableCapabilities: [
				'enumerate tree items',
				'observe explorer renders',
				'read core sort mode',
				'run core sorting',
				'apply custom sorting',
				'expand and collapse folders',
				'select items',
				'scroll to items',
				'add toolbar actions',
			],
			itemCount: 0,
			sortMode: null,
		});
		expect(adapter.getItems()).toEqual([]);
		expect(adapter.runOriginalSort()).toBe(false);
		expect(adapter.expand('Projects')).toBe(false);
		expect(adapter.collapse('Projects')).toBe(false);
		expect(adapter.select('Welcome.md')).toBe(false);
		expect(adapter.scrollTo('Welcome.md')).toBe(false);
	});

	it('sorts underlying folder children with configured rules', () => {
		const { view } = createView();
		const adapter = createExplorerAdapter(view);
		const folder = {
			path: 'Projects',
			children: [
				{
					path: 'Projects/Alpha.md',
					name: 'Alpha.md',
					stat: { ctime: 10, mtime: 10 },
				},
				{
					path: 'Projects/Folder',
					name: 'Folder',
					children: [],
				},
				{
					path: 'Projects/Zulu.md',
					name: 'Zulu.md',
					stat: { ctime: 20, mtime: 20 },
				},
			],
		};

		const dispose = adapter.installSorting(() => ({
			groupFoldersFirst: false,
			prefixPositions: new Map([['Zulu.md', 0]]),
			sortMode: 'name-ascending',
		}));

		expect(view.getSortedFolderItems(folder)).toEqual([
			folder.children[2],
			folder.children[0],
			folder.children[1],
		]);

		dispose?.();
		expect(view.getSortedFolderItems(folder)).toEqual(folder.children);
	});

	it('leaves native results unchanged when sorting metadata is unavailable', () => {
		const { view } = createView();
		const adapter = createExplorerAdapter(view);
		const children = [{ name: 'Missing path' }];
		adapter.installSorting(() => ({
			groupFoldersFirst: false,
			sortMode: 'name-ascending',
		}));

		expect(view.getSortedFolderItems({ path: '', children })).toEqual(children);
	});

	it('runs the sort implementation captured during attachment', () => {
		const { view } = createView();
		const originalSort = view.sort;
		const adapter = createExplorerAdapter(view);
		view.sort = vi.fn();

		expect(adapter.runOriginalSort()).toBe(true);
		expect(originalSort).toHaveBeenCalledOnce();
		expect(view.sort).not.toHaveBeenCalled();
	});

	it('disables operations that throw without logging errors', () => {
		const { view } = createView();
		view.sort.mockImplementation(() => {
			throw new Error('incompatible sort');
		});
		const adapter = createExplorerAdapter(view);

		expect(adapter.runOriginalSort()).toBe(false);
		expect(adapter.getCompatibilityReport()).toEqual({
			available: false,
			unavailableCapabilities: ['run core sorting'],
			itemCount: 2,
			sortMode: 'alphabetical',
		});
	});

	it('disables navigation operations that throw', () => {
		const { folderItem, view } = createView();
		folderItem.setCollapsed = vi.fn(() => {
			throw new Error('incompatible collapse');
		});
		view.tree.clearSelectedDoms = vi.fn(() => {
			throw new Error('incompatible selection');
		});
		view.tree.infinityScroll.scrollIntoView = vi.fn(() => {
			throw new Error('incompatible scrolling');
		});
		const adapter = createExplorerAdapter(view);

		expect(adapter.expand('Projects')).toBe(false);
		expect(adapter.select('Welcome.md')).toBe(false);
		expect(adapter.scrollTo('Welcome.md')).toBe(false);
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toEqual([
			'expand and collapse folders',
			'select items',
			'scroll to items',
		]);
	});

	it('expands, collapses, selects, and scrolls to paths', () => {
		const { folderItem, selected, view } = createView();
		const adapter = createExplorerAdapter(view);

		expect(adapter.expand('Projects')).toBe(true);
		expect(folderItem.collapsed).toBe(false);
		expect(adapter.collapse('Projects')).toBe(true);
		expect(folderItem.collapsed).toBe(true);
		expect(folderItem.setCollapsed).toHaveBeenNthCalledWith(1, false, true);
		expect(folderItem.setCollapsed).toHaveBeenNthCalledWith(2, true, true);

		expect(adapter.select('Welcome.md')).toBe(true);
		expect(selected.has(view.fileItems['Welcome.md'])).toBe(true);
		expect(view.tree.setFocusedItem).toHaveBeenCalledWith(
			view.fileItems['Welcome.md'],
			true,
		);
		expect(adapter.scrollTo('Welcome.md')).toBe(true);
		expect(view.tree.infinityScroll.scrollIntoView).toHaveBeenCalledWith(
			view.fileItems['Welcome.md'],
			4,
		);
	});

	it('adds and removes toolbar actions', () => {
		const { toolbarElement, view } = createView();
		const adapter = createExplorerAdapter(view);
		const callback = vi.fn();

		const dispose = adapter.addToolbarAction({
			icon: 'wrench',
			title: 'Check compatibility',
			callback,
		});

		expect(view.addAction).toHaveBeenCalledWith(
			'wrench',
			'Check compatibility',
			callback,
		);
		dispose?.();
		expect(toolbarElement.remove).toHaveBeenCalledOnce();
	});

	it('rejects toolbar actions without a removable element', () => {
		const { view } = createView();
		const adapter = createExplorerAdapter({
			...view,
			addAction: vi.fn(() => undefined),
		});

		expect(
			adapter.addToolbarAction({
				icon: 'wrench',
				title: 'Check compatibility',
				callback: vi.fn(),
			}),
		).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toEqual([
			'add toolbar actions',
		]);
	});

	it('uses the file explorer internal toolbar when addAction is unavailable', () => {
		const { toolbarElement, view } = createView();
		const addNavButton = vi.fn(() => toolbarElement);
		const adapter = createExplorerAdapter({
			...view,
			addAction: undefined,
			headerDom: { addNavButton },
		});
		const callback = vi.fn();

		const dispose = adapter.addToolbarAction({
			icon: 'wrench',
			title: 'Check compatibility',
			callback,
		});

		expect(addNavButton).toHaveBeenCalledWith(
			'wrench',
			'Check compatibility',
			callback,
		);
		dispose?.();
		expect(toolbarElement.remove).toHaveBeenCalledOnce();
	});

	it('rejects render observers that cannot attach', () => {
		const { view } = createView();
		const adapter = createExplorerAdapter(view, () => {
			throw new Error('incompatible observer');
		});

		expect(adapter.observeRenders(vi.fn())).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toEqual([
			'observe explorer renders',
		]);
	});

	it('observes explorer renders and disconnects the observer', () => {
		const { view } = createView();
		const { disconnect, factory, observe, trigger } =
			createObserverFactory();
		const adapter = createExplorerAdapter(view, factory);
		const callback = vi.fn();

		const dispose = adapter.observeRenders(callback);

		expect(factory).toHaveBeenCalledWith(callback);
		expect(observe).toHaveBeenCalledWith(
			view.navFileContainerEl,
			{ childList: true, subtree: true },
		);
		trigger();
		expect(callback).toHaveBeenCalledOnce();
		dispose?.();
		expect(disconnect).toHaveBeenCalledOnce();
	});
});
