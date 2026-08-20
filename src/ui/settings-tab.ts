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
			.setName('Group folders first')
			.setDesc('Place folders before files instead of mixing them together.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.groupFoldersFirst)
					.onChange(async (value) => {
						this.plugin.settings.groupFoldersFirst = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
