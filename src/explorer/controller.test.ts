import { describe, expect, it, vi } from 'vitest';
import type { ExplorerAdapter } from './adapter-types';
import {
	ExplorerController,
	type ExplorerLeaf,
	type ExplorerPluginHost,
} from './controller';

function createAdapter(overrides: Partial<ExplorerAdapter> = {}) {
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
	const adapter: ExplorerAdapter = {
		addToolbarAction: vi.fn(() => disposeToolbar),
		collapse: vi.fn(() => true),
		expand: vi.fn(() => true),
		getCompatibilityReport,
		getItems: vi.fn(() => []),
		getSortMode,
		observeRenders: vi.fn(() => disposeObserver),
		runOriginalSort: vi.fn(() => true),
		scrollTo: vi.fn(() => true),
		select: vi.fn(() => true),
		...overrides,
	};
	return { adapter, disposeObserver, disposeToolbar };
}

function createHost(initialLeaves: ExplorerLeaf[]) {
	let leaves = initialLeaves;
	let layoutReadyCallback: (() => void) | null = null;
	let layoutChangeCallback: (() => void) | null = null;
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
	const registerEvent = vi.fn();
	const host: ExplorerPluginHost = {
		app: {
			workspace: {
				getLeavesOfType,
				on: onLayoutChange,
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
		expect(registerEvent).toHaveBeenCalledOnce();

		controller.dispose();
		expect(disposeToolbar).toHaveBeenCalledOnce();
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

		expect(first.disposeToolbar).toHaveBeenCalledOnce();
		expect(first.disposeObserver).toHaveBeenCalledOnce();
		expect(createAdapterForView).toHaveBeenCalledTimes(2);

		controller.dispose();
		expect(second.disposeToolbar).toHaveBeenCalledOnce();
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

		expect(first.disposeToolbar).toHaveBeenCalledOnce();
		expect(first.disposeObserver).toHaveBeenCalledOnce();
		expect(createAdapterForView).toHaveBeenCalledTimes(2);
		expect(showNotice).toHaveBeenCalledWith(
			'File Explorer Tools: file explorer compatibility check failed.',
		);

		controller.dispose();
		expect(second.disposeToolbar).toHaveBeenCalledOnce();
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
});
