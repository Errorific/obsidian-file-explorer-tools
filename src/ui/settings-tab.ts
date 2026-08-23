import { App, PluginSettingTab, Setting } from 'obsidian';
import type FileExplorerToolsPlugin from '../main';

export class FileExplorerToolsSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: FileExplorerToolsPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): [] {
		return [];
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName('Mix files and folders')
			.setDesc('Sort files and folders together by name.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.mixFilesAndFolders)
					.onChange(async (value) => {
						this.plugin.settings.mixFilesAndFolders = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
