import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileExplorerToolsSettings } from './settings';

const mocks = vi.hoisted(() => ({
	applyDelete: vi.fn(),
	applyRename: vi.fn(),
	controllerDispose: vi.fn(),
	controllerRefreshSorting: vi.fn(),
	controllerRefreshVisibility: vi.fn(),
	controllerStart: vi.fn(),
	controllerMoveTemporaryVisibility: vi.fn(),
	controllerInstances: [] as unknown[],
	prepareSettings: vi.fn(),
	reconcileSettings: vi.fn(),
	registerCommands: vi.fn(),
	registerFolderSortMenu: vi.fn(),
	registerHiddenItemMenu: vi.fn(),
	registerPinMenu: vi.fn(),
}));

vi.mock('obsidian', () => ({
	Notice: class Notice {},
	Plugin: class Plugin {
		app: unknown;

		constructor(app: unknown) {
			this.app = app;
		}

		addCommand(): void {}
		addSettingTab(): void {}
		loadData(): Promise<unknown> {
			return Promise.resolve(undefined);
		}
		registerEvent(): void {}
		saveData(): Promise<void> {
			return Promise.resolve();
		}
	},
}));

vi.mock('./commands/register', () => ({
	registerCommands: mocks.registerCommands,
}));
vi.mock('./explorer/controller', () => ({
	ExplorerController: class ExplorerController {
		constructor(...args: unknown[]) {
			mocks.controllerInstances.push(args);
		}

		dispose = mocks.controllerDispose;
		isPinningAvailable = vi.fn(() => true);
		moveTemporaryVisibility = mocks.controllerMoveTemporaryVisibility;
		refreshSorting = mocks.controllerRefreshSorting;
		refreshVisibility = mocks.controllerRefreshVisibility;
		start = mocks.controllerStart;
	},
}));
vi.mock('./settings', () => ({
	prepareSettings: mocks.prepareSettings,
	reconcileSettings: mocks.reconcileSettings,
}));
vi.mock('./settings-events', () => ({
	applyDelete: mocks.applyDelete,
	applyRename: mocks.applyRename,
}));
vi.mock('./hiding/menu', () => ({
	registerHiddenItemMenu: mocks.registerHiddenItemMenu,
}));
vi.mock('./integrations/folder-notes', () => ({
	createFolderNoteIntegration: vi.fn(() => null),
}));
vi.mock('./sorting/folder-menu', () => ({
	registerFolderSortMenu: mocks.registerFolderSortMenu,
}));
vi.mock('./sorting/pin-menu', () => ({
	registerPinMenu: mocks.registerPinMenu,
}));
vi.mock('./ui/settings-tab', () => ({
	FileExplorerToolsSettingsTab: class FileExplorerToolsSettingsTab {},
}));

import FileExplorerToolsPlugin from './main';

const settings: FileExplorerToolsSettings = {
	schemaVersion: 1,
	mixFilesAndFolders: false,
	hiddenPaths: [],
	folders: {},
};

interface TestApp {
	vault: {
		on: ReturnType<typeof vi.fn>;
	};
	workspace: {
		on: ReturnType<typeof vi.fn>;
		onLayoutReady: ReturnType<typeof vi.fn>;
	};
}

function createApp(): TestApp {
	return {
		vault: {
			on: vi.fn(() => ({})),
		},
		workspace: {
			on: vi.fn(() => ({})),
			onLayoutReady: vi.fn(),
		},
	};
}

function deferred(): {
	promise: Promise<void>;
	resolve: () => void;
} {
	let resolve = (): void => undefined;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe('FileExplorerToolsPlugin lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.controllerInstances.length = 0;
		mocks.prepareSettings.mockReturnValue({ settings, needsSave: false });
		mocks.reconcileSettings.mockReturnValue(settings);
	});

	it('does not finish initialization when unloaded during the initial save', async () => {
		const app = createApp();
		const plugin = new FileExplorerToolsPlugin(app as never, {} as never);
		const initialSave = deferred();
		vi.spyOn(plugin, 'loadData').mockResolvedValue({});
		const saveData = vi
			.spyOn(plugin, 'saveData')
			.mockReturnValue(initialSave.promise);
		const addSettingTab = vi.spyOn(plugin, 'addSettingTab');
		mocks.prepareSettings.mockReturnValue({ settings, needsSave: true });

		const loading = plugin.onload();
		await vi.waitFor(() => expect(saveData).toHaveBeenCalledOnce());
		plugin.onunload();
		initialSave.resolve();
		await loading;

		expect(addSettingTab).not.toHaveBeenCalled();
		expect(mocks.controllerInstances).toHaveLength(0);
		expect(mocks.registerCommands).not.toHaveBeenCalled();
		expect(app.vault.on).not.toHaveBeenCalled();
	});

	it('applies vault renames and persists changed settings', async () => {
		const app = createApp();
		const callbacks = new Map<string, (...args: never[]) => void>();
		app.vault.on.mockImplementation(
			(name: string, callback: (...args: never[]) => void) => {
				callbacks.set(name, callback);
				return {};
			},
		);
		const plugin = new FileExplorerToolsPlugin(app as never, {} as never);
		vi.spyOn(plugin, 'loadData').mockResolvedValue({});
		const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue();
		mocks.applyRename.mockReturnValue(true);
		await plugin.onload();

		callbacks.get('rename')?.({ path: 'Archive/Note.md' } as never, 'Note.md' as never);
		await vi.waitFor(() => expect(saveData).toHaveBeenCalledOnce());

		expect(mocks.applyRename).toHaveBeenCalledWith(
			settings,
			'Note.md',
			'Archive/Note.md',
		);
		expect(mocks.controllerMoveTemporaryVisibility).toHaveBeenCalledWith(
			'Note.md',
			'Archive/Note.md',
		);
		expect(mocks.controllerRefreshVisibility).toHaveBeenCalledOnce();
	});

	it('does not persist a delete that leaves settings unchanged', async () => {
		const app = createApp();
		const callbacks = new Map<string, (...args: never[]) => void>();
		app.vault.on.mockImplementation(
			(name: string, callback: (...args: never[]) => void) => {
				callbacks.set(name, callback);
				return {};
			},
		);
		const plugin = new FileExplorerToolsPlugin(app as never, {} as never);
		vi.spyOn(plugin, 'loadData').mockResolvedValue({});
		const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue();
		mocks.applyDelete.mockReturnValue(false);
		await plugin.onload();

		callbacks.get('delete')?.({ path: 'Note.md' } as never);

		expect(mocks.applyDelete).toHaveBeenCalledWith(settings, 'Note.md');
		expect(saveData).not.toHaveBeenCalled();
		expect(mocks.controllerRefreshVisibility).not.toHaveBeenCalled();
	});
});
