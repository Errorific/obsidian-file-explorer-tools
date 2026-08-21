import { Notice, Plugin } from 'obsidian';
import { ExplorerController } from './explorer/controller';
import {
	type FileExplorerToolsSettings,
	prepareSettings,
} from './settings';
import { FileExplorerToolsSettingsTab } from './ui/settings-tab';

export default class FileExplorerToolsPlugin extends Plugin {
	settings!: FileExplorerToolsSettings;
	private explorerController: ExplorerController | null = null;

	async onload(): Promise<void> {
		const prepared = prepareSettings(await this.loadData(), this.app.vault);
		this.settings = prepared.settings;
		if (prepared.needsSave) {
			await this.saveSettings();
		}
		this.addSettingTab(new FileExplorerToolsSettingsTab(this.app, this));
		this.explorerController = new ExplorerController(this, {
			showNotice: (message) => new Notice(message),
		});
		this.explorerController.start();
	}

	onunload(): void {
		this.explorerController?.dispose();
		this.explorerController = null;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
