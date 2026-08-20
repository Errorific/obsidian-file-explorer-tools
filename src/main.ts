import { Plugin } from 'obsidian';
import {
	type FileExplorerToolsSettings,
	prepareSettings,
} from './settings';
import { FileExplorerToolsSettingsTab } from './ui/settings-tab';

export default class FileExplorerToolsPlugin extends Plugin {
	settings!: FileExplorerToolsSettings;

	async onload(): Promise<void> {
		const prepared = prepareSettings(await this.loadData(), this.app.vault);
		this.settings = prepared.settings;
		if (prepared.needsSave) {
			await this.saveSettings();
		}
		this.addSettingTab(new FileExplorerToolsSettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
