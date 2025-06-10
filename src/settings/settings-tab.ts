import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import { GLSLViewerSettings } from '../types/settings';
import { ImageFileSuggestModal } from '../ui/file-suggest-modal';
import { FolderSuggestModal } from '../ui/folder-suggest-modal';
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

		// Default Autoplay setting
		new Setting(containerEl)
			.setName('Default Autoplay')
			.setDesc('Whether new GLSL viewers should automatically start playing by default. Individual shaders can override this with @autoplay: directive.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultAutoplay)
				.onChange(async (value) => {
					this.plugin.settings.defaultAutoplay = value;
					await this.plugin.saveSettings();
				})
			);

		// Default Hide Code setting
		new Setting(containerEl)
			.setName('Default Hide Code')
			.setDesc('Whether to hide the code block content by default in reading mode. Individual shaders can override this with @hideCode: directive.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultHideCode)
				.onChange(async (value) => {
					this.plugin.settings.defaultHideCode = value;
					await this.plugin.saveSettings();
								})
			);

		// Textures Settings Section
		containerEl.createEl('h3', { text: 'Textures' });

		// Add horizontal rule
		containerEl.createEl('hr', { cls: 'glsl-settings-divider' });

		// Textures description
		const texturesDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		texturesDesc.createEl('p').textContent = 'Configure texture settings for GLSL shaders. Textures can be specified using file paths or shortcuts.';

		// Texture Folder setting
		let textureFolderTextComponent: TextComponent;
		new Setting(containerEl)
			.setName('Texture Folder')
			.setDesc('Folder containing texture files. Browse dialogs will search only within this folder. Leave empty to search entire vault.')
			.addText(text => {
				textureFolderTextComponent = text;
				return text
					.setPlaceholder('textures')
					.setValue(this.plugin.settings.textureFolder)
					.onChange(async (value) => {
						this.plugin.settings.textureFolder = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => button
				.setButtonText('Browse')
				.setTooltip('Browse for folder')
				.onClick(() => {
					const modal = new FolderSuggestModal(this.app, (selectedPath) => {
						textureFolderTextComponent.setValue(selectedPath);
						this.plugin.settings.textureFolder = selectedPath;
						this.plugin.saveSettings();
					});
					modal.open();
				})
			)
			.addButton(button => button
				.setButtonText('×')
				.setTooltip('Clear texture folder restriction')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.textureFolder = '';
					await this.plugin.saveSettings();
					this.display(); // Refresh display
				})
			);

		// iChannels Default section
		containerEl.createEl('h4', { text: 'iChannels Default' });

		const defaultTextureInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
		defaultTextureInfo.createEl('p').textContent = 'Textures automatically loaded when not specified in shader comments. Leave empty to disable.';
		const supportedNote = defaultTextureInfo.createEl('p');
		const supportedStrong = supportedNote.createEl('strong');
		supportedStrong.textContent = 'Supported:';
		supportedNote.appendText(' Vault-relative paths only');
		const changesNote = defaultTextureInfo.createEl('p');
		const changesStrong = changesNote.createEl('strong');
		changesStrong.textContent = 'Note:';
		changesNote.appendText(' Changes apply to new shaders only.');

		// Helper function to create texture setting
		const createTextureSetting = (channelName: 'defaultIChannel0' | 'defaultIChannel1' | 'defaultIChannel2' | 'defaultIChannel3', channelIndex: number, defaultValue: string) => {
			let textComponent: TextComponent;

			const setting = new Setting(containerEl)
				.setName(`iChannel${channelIndex} Default`)
				.setDesc(`Default texture for iChannel${channelIndex}. ${defaultValue ? `Currently set: ${defaultValue.length > 40 ? defaultValue.substring(0, 40) + '...' : defaultValue}` : 'Not set'}`)
				.addText(text => {
					textComponent = text;
					return text
						.setPlaceholder('path/to/texture.png')
						.setValue(defaultValue)
						.onChange(async (value) => {
							this.plugin.settings[channelName] = value;
							await this.plugin.saveSettings();
							// Update description to show current status
							setting.setDesc(`Default texture for iChannel${channelIndex}. ${value ? `Currently set: ${value.length > 40 ? value.substring(0, 40) + '...' : value}` : 'Not set'}`);
						});
				})
				.addButton(button => button
					.setButtonText('Browse')
					.setTooltip('Browse for image file')
					.onClick(() => {
						const modal = new ImageFileSuggestModal(this.app, (selectedPath) => {
							textComponent.setValue(selectedPath);
							this.plugin.settings[channelName] = selectedPath;
							this.plugin.saveSettings();
							// Update description to show current status
							setting.setDesc(`Default texture for iChannel${channelIndex}. Currently set: ${selectedPath.length > 40 ? selectedPath.substring(0, 40) + '...' : selectedPath}`);
						}, this.plugin.settings.textureFolder);
						modal.open();
					})
				);

			// Add clear button if there's a value
			if (defaultValue) {
				setting.addButton(button => button
					.setButtonText('×')
					.setTooltip(`Clear iChannel${channelIndex} default`)
					.setWarning()
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

		// Texture Shortcuts section
		containerEl.createEl('h4', { text: 'Texture Shortcuts' });
		const shortcutDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		shortcutDesc.createEl('p').textContent = 'Create shortcuts for frequently used textures. Use shortcut keys in @iChannel directives (e.g., @iChannel0: tex1).';

		// Shortcuts container
		const shortcutsContainer = containerEl.createDiv({ cls: 'texture-shortcuts-container' });

		// Render existing shortcuts
		this.renderTextureShortcuts(shortcutsContainer);

		// Add shortcut button
		const addShortcutContainer = containerEl.createDiv({ cls: 'add-shortcut-container' });
		new Setting(addShortcutContainer)
			.addButton(button => button
				.setButtonText('+ Add Shortcut')
				.setTooltip('Add new texture shortcut')
				.onClick(() => {
					this.plugin.settings.textureShortcuts.push({ key: '', path: '' });
					this.plugin.saveSettings();
					this.renderTextureShortcuts(shortcutsContainer);
				})
			);
	}

	private renderTextureShortcuts(container: HTMLElement): void {
		container.empty();

				this.plugin.settings.textureShortcuts.forEach((shortcut, index) => {
			const shortcutEl = container.createDiv({ cls: 'texture-shortcut-item' });

			let keyComponent: TextComponent;
			let pathComponent: TextComponent;

			const setting = new Setting(shortcutEl)
				.addText(text => {
					keyComponent = text;
					return text
						.setPlaceholder('tex1')
						.setValue(shortcut.key)
						.onChange(async (value) => {
							this.plugin.settings.textureShortcuts[index].key = value;
							await this.plugin.saveSettings();
						});
				})
				.addText(text => {
					pathComponent = text;
					return text
						.setPlaceholder('path/to/texture.png')
						.setValue(shortcut.path)
						.onChange(async (value) => {
							this.plugin.settings.textureShortcuts[index].path = value;
							await this.plugin.saveSettings();
						});
				})
				.addButton(button => button
					.setButtonText('Browse')
					.setTooltip('Browse for texture file')
					.onClick(() => {
						const modal = new ImageFileSuggestModal(this.app, (selectedPath) => {
							pathComponent.setValue(selectedPath);
							this.plugin.settings.textureShortcuts[index].path = selectedPath;
							this.plugin.saveSettings();
						}, this.plugin.settings.textureFolder);
						modal.open();
					})
				)
				.addButton(button => button
					.setButtonText('×')
					.setTooltip('Remove shortcut')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.textureShortcuts.splice(index, 1);
						await this.plugin.saveSettings();
						this.renderTextureShortcuts(container);
					})
				);



						// Add CSS classes and labels for better UX
			const controls = setting.controlEl;
			const keyInput = controls.querySelector('.setting-item-control input:first-of-type') as HTMLInputElement;
			const pathInput = controls.querySelector('.setting-item-control input:nth-of-type(2)') as HTMLInputElement;

			if (keyInput) {
				keyInput.addClass('shortcut-key-input');
				keyInput.setAttribute('aria-label', 'Shortcut key');
			}
			if (pathInput) {
				pathInput.addClass('shortcut-path-input');
				pathInput.setAttribute('aria-label', 'Texture path');
			}
		});
	}
}