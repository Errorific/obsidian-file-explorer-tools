import { Notice, Plugin } from 'obsidian';
import { ExplorerController } from './explorer/controller';
import {
	type FileExplorerToolsSettings,
	prepareSettings,
	reconcileSettings,
} from './settings';
import { applyDelete, applyRename } from './settings-events';
import { registerFolderSortMenu } from './sorting/folder-menu';
import { FileExplorerToolsSettingsTab } from './ui/settings-tab';

export default class FileExplorerToolsPlugin extends Plugin {
	settings!: FileExplorerToolsSettings;
	private explorerController: ExplorerController | null = null;
	private unloaded = false;

	async onload(): Promise<void> {
		this.unloaded = false;
		const data: unknown = await this.loadData();
		if (this.unloaded) {
			return;
		}
		const prepared = prepareSettings(data);
		this.settings = prepared.settings;
		if (prepared.needsSave) {
			await this.saveSettings();
		}
		this.addSettingTab(new FileExplorerToolsSettingsTab(this.app, this));
		this.explorerController = new ExplorerController(this, {
			getSettings: () => this.settings,
			showNotice: (message) => new Notice(message),
		});
		this.addCommand({
			id: 'toggle-force-global-sorting',
			name: 'Toggle force global sorting',
			callback: () => this.explorerController?.toggleForceGlobal(),
		});
		registerFolderSortMenu(this);
		this.app.workspace.onLayoutReady(() => {
			if (this.unloaded) {
				return;
			}
			const reconciled = reconcileSettings(this.settings, this.app.vault);
			if (JSON.stringify(reconciled) !== JSON.stringify(this.settings)) {
				this.settings = reconciled;
				void this.saveSettings();
			}
		});
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (applyRename(this.settings, oldPath, file.path)) {
					void this.saveSettings();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (applyDelete(this.settings, file.path)) {
					void this.saveSettings();
				}
			}),
		);
		this.explorerController.start();
	}

	onunload(): void {
		this.unloaded = true;
		this.explorerController?.dispose();
		this.explorerController = null;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.explorerController?.refreshSorting();
	}
}
