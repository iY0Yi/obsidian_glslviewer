import { App, PluginSettingTab, Setting } from 'obsidian';
import { GLSLViewerSettings } from '../types/settings';
import type { Plugin } from 'obsidian';

// Type for the plugin reference
interface GLSLViewerPlugin extends Plugin {
	settings: GLSLViewerSettings;
	saveSettings(): Promise<void>;
}

export class GLSLViewerSettingTab extends PluginSettingTab {
	plugin: GLSLViewerPlugin;

	constructor(app: App, plugin: GLSLViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'GLSL Viewer Settings' });

		// Performance Settings Section
		containerEl.createEl('h3', { text: 'Performance Settings' });

		// Max Active Viewers setting
		new Setting(containerEl)
			.setName('Maximum Active Viewers')
			.setDesc('Controls how many GLSL shaders can run simultaneously to prevent performance issues. Recommended: 5-15 (performance-focused: 3-8). Changes apply to new shaders.')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(this.plugin.settings.maxActiveViewers.toString())
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue >= 1 && numValue <= 50) {
						this.plugin.settings.maxActiveViewers = numValue;
						await this.plugin.saveSettings();
					}
				})
			)
			.addButton(button => button
				.setButtonText('Reset')
				.setTooltip('Reset to default (10)')
				.onClick(async () => {
					this.plugin.settings.maxActiveViewers = 10;
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				})
			);

				// Display Settings Section
		containerEl.createEl('h3', { text: 'Display Settings' });

				// Default Aspect Ratio setting
		new Setting(containerEl)
			.setName('Default Aspect Ratio')
			.setDesc('Default height/width ratio for new GLSL viewers. Common values: 0.5625 (16:9), 0.75 (4:3), 1.0 (square), 1.777 (9:16). Range: 0.1-5.0')
			.addText(text => text
				.setPlaceholder('0.5625')
				.setValue(this.plugin.settings.defaultAspect.toString())
				.onChange(async (value) => {
					const numValue = parseFloat(value);
					if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 5.0) {
						this.plugin.settings.defaultAspect = numValue;
						await this.plugin.saveSettings();
					}
				})
			)
			.addButton(button => button
				.setButtonText('Reset')
				.setTooltip('Reset to default 16:9 (0.5625)')
				.onClick(async () => {
					this.plugin.settings.defaultAspect = 0.5625;
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				})
			);

				// Default Texture Settings
		containerEl.createEl('h3', { text: 'Default Textures' });

		const textureInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
		// Use DOM API instead of innerHTML for security
		const para1 = textureInfo.createEl('p');
		para1.textContent = 'Textures automatically loaded when not specified in shader comments. Leave empty to disable.';

		const para2 = textureInfo.createEl('p');
		const strong = para2.createEl('strong');
		strong.textContent = 'Supported:';
		para2.appendText(' Vault-relative paths only');

		const para3 = textureInfo.createEl('p');
		const noteStrong = para3.createEl('strong');
		noteStrong.textContent = 'Note:';
		para3.appendText(' Changes apply to new shaders only.');

		// Helper function to create texture setting
		const createTextureSetting = (channelName: 'defaultIChannel0' | 'defaultIChannel1' | 'defaultIChannel2' | 'defaultIChannel3', channelIndex: number, defaultValue: string) => {
			const setting = new Setting(containerEl)
				.setName(`iChannel${channelIndex} Default`)
				.setDesc(`Default texture for iChannel${channelIndex}. ${defaultValue ? `Currently set: ${defaultValue.length > 40 ? defaultValue.substring(0, 40) + '...' : defaultValue}` : 'Not set'}`)
				.addText(text => text
					.setPlaceholder('path/to/texture.png')
					.setValue(defaultValue)
					.onChange(async (value) => {
						this.plugin.settings[channelName] = value;
						await this.plugin.saveSettings();
						// Update description to show current status
						setting.setDesc(`Default texture for iChannel${channelIndex}. ${value ? `Currently set: ${value.length > 40 ? value.substring(0, 40) + '...' : value}` : 'Not set'}`);
					})
				);

			// Add clear button if there's a value
			if (defaultValue) {
				setting.addButton(button => button
					.setButtonText('Clear')
					.setTooltip(`Clear iChannel${channelIndex} default`)
					.onClick(async () => {
						this.plugin.settings[channelName] = '';
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					})
				);
			}

			return setting;
		};

		// Create settings for each channel
		createTextureSetting('defaultIChannel0', 0, this.plugin.settings.defaultIChannel0);
		createTextureSetting('defaultIChannel1', 1, this.plugin.settings.defaultIChannel1);
		createTextureSetting('defaultIChannel2', 2, this.plugin.settings.defaultIChannel2);
		createTextureSetting('defaultIChannel3', 3, this.plugin.settings.defaultIChannel3);

		// Reset all textures button
		new Setting(containerEl)
			.setName('Reset All Textures')
			.setDesc('Clear all default texture settings')
			.addButton(button => button
				.setButtonText('Reset All')
				.setTooltip('Clear all default textures')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.defaultIChannel0 = '';
					this.plugin.settings.defaultIChannel1 = '';
					this.plugin.settings.defaultIChannel2 = '';
					this.plugin.settings.defaultIChannel3 = '';
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				})
			);
	}
}