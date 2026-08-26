import { Notice, Plugin } from 'obsidian';
import { registerCommands } from './commands/register';
import { ExplorerController } from './explorer/controller';
import {
	type FileExplorerToolsSettings,
	prepareSettings,
	reconcileSettings,
} from './settings';
import { applyDelete, applyRename } from './settings-events';
import { registerHiddenItemMenu } from './hiding/menu';
import { createFolderNoteIntegration } from './integrations/folder-notes';
import { registerFolderSortMenu } from './sorting/folder-menu';
import { registerPinMenu } from './sorting/pin-menu';
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
			saveSettings: () => this.saveSettings(),
			showNotice: (message) => new Notice(message),
			folderNotes: {
				getAssociatedFolderPath: (file) =>
					createFolderNoteIntegration(this.app)?.getAssociatedFolderPath(file) ??
					null,
			},
		});
		registerCommands(this, () => this.explorerController);
		registerFolderSortMenu(this);
		registerPinMenu(this);
		registerHiddenItemMenu(this);
		this.app.workspace.onLayoutReady(() => {
			if (this.unloaded) {
				return;
			}
			const reconciled = reconcileSettings(this.settings, this.app.vault);
			if (JSON.stringify(reconciled) !== JSON.stringify(this.settings)) {
				this.settings = reconciled;
				void this.saveSettings();
				this.explorerController?.refreshVisibility();
			}
		});
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const changed = applyRename(this.settings, oldPath, file.path);
				this.explorerController?.moveTemporaryVisibility(oldPath, file.path);
				if (changed) {
					void this.saveSettings();
					this.explorerController?.refreshVisibility();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (applyDelete(this.settings, file.path)) {
					void this.saveSettings();
					this.explorerController?.refreshVisibility();
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
