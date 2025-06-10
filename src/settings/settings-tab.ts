import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import { GLSLViewerSettings } from '../types/settings';
import { ImageFileSuggestModal } from '../ui/file-suggest-modal';
import { FolderSuggestModal } from '../ui/folder-suggest-modal';
import { createSVGIconElement } from '../utils/icons';
import type { Plugin } from 'obsidian';
import { TFile } from 'obsidian';

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

	// Helper method to add icon to button
	private addIconToButton(buttonEl: HTMLButtonElement, iconName: string): void {
		const icon = createSVGIconElement(iconName);
		if (icon) {
			// Add icon-only class for styling
			buttonEl.classList.add('icon-only');

			// Clear any existing content and add icon
			buttonEl.textContent = '';
			buttonEl.appendChild(icon);
		}
	}

	// Helper method to create image placeholder (always shown)
	private createImagePlaceholder(container: HTMLElement, imagePath?: string): HTMLElement {
		// Add class to container for styling
		container.addClass('has-image-placeholder');

		// Create placeholder container
		const placeholderContainer = container.createDiv({ cls: 'setting-image-placeholder' });

		if (imagePath && imagePath.trim()) {
			// If image path is provided, try to load thumbnail
			this.loadImageIntoPlaceholder(placeholderContainer, imagePath);
		} else {
			// Show default image icon
			this.showDefaultImageIcon(placeholderContainer);
		}

		return placeholderContainer;
	}

	// Helper method to load image into placeholder
	private async loadImageIntoPlaceholder(container: HTMLElement, imagePath: string): Promise<void> {
		// Check if file exists using TFile
		const file = this.app.vault.getAbstractFileByPath(imagePath);
		if (!file || !(file instanceof TFile)) {
			this.showDefaultImageIcon(container);
			return;
		}

		try {
			// Load image using Obsidian's vault API
			const arrayBuffer = await this.app.vault.readBinary(file);
			const blob = new Blob([arrayBuffer]);
			const url = URL.createObjectURL(blob);

			const thumbnail = container.createEl('img', { cls: 'setting-thumbnail-img' });
			thumbnail.src = url;
			thumbnail.onload = () => {
				URL.revokeObjectURL(url);
			};
			thumbnail.onerror = () => {
				URL.revokeObjectURL(url);
				container.empty();
				this.showDefaultImageIcon(container);
			};
		} catch (error) {
			// Silently handle image loading errors to avoid polluting the console
			// Only log in development mode if needed for debugging
			if (process.env.NODE_ENV === 'development') {
				console.warn('Failed to load thumbnail for:', imagePath, error);
			}
			container.empty();
			this.showDefaultImageIcon(container);
		}
	}

	// Helper method to show default image icon
	private showDefaultImageIcon(container: HTMLElement): void {
		const icon = createSVGIconElement('imagesmode');
		if (icon) {
			container.empty();
			container.addClass('setting-placeholder-icon');
			container.appendChild(icon);
		}
	}

	// Helper method to refresh image placeholder
	private async refreshImagePlaceholder(settingEl: HTMLElement, imagePath: string): Promise<void> {
		// Find existing placeholder
		const existingPlaceholder = settingEl.querySelector('.setting-image-placeholder');
		if (existingPlaceholder) {
			// Update the placeholder content
			if (imagePath && imagePath.trim()) {
				await this.loadImageIntoPlaceholder(existingPlaceholder as HTMLElement, imagePath);
			} else {
				this.showDefaultImageIcon(existingPlaceholder as HTMLElement);
			}
		} else {
			// Create new placeholder if it doesn't exist
			this.createImagePlaceholder(settingEl, imagePath);
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Add specific class to limit CSS scope
		containerEl.addClass('glsl-viewer-settings');

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
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Reset to default (10)')
					.onClick(async () => {
						this.plugin.settings.maxActiveViewers = 10;
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					});

				// Add refresh icon to reset button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

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
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Reset to default 16:9 (0.5625)')
					.onClick(async () => {
						this.plugin.settings.defaultAspect = 0.5625;
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					});

				// Add refresh icon to reset button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

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
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Browse for folder')
					.onClick(() => {
						const modal = new FolderSuggestModal(this.app, (selectedPath) => {
							textureFolderTextComponent.setValue(selectedPath);
							this.plugin.settings.textureFolder = selectedPath;
							this.plugin.saveSettings();
						});
						modal.open();
					});

				// Add folder open icon to browse button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'folder_open');
				}, 0);

				return btn;
			})
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Clear texture folder restriction')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.textureFolder = '';
						await this.plugin.saveSettings();
						this.display(); // Refresh display
					});

				// Add close icon to clear button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'close');
				}, 0);

				return btn;
			});

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
							// Update placeholder
							this.refreshImagePlaceholder(setting.settingEl, value);
						});
				})
												.addButton(button => {
					const btn = button
						.setButtonText('')
						.setTooltip('Browse for image file')
						.onClick(() => {
							const modal = new ImageFileSuggestModal(this.app, (selectedPath) => {
								textComponent.setValue(selectedPath);
								this.plugin.settings[channelName] = selectedPath;
								this.plugin.saveSettings();
								// Update description to show current status
								setting.setDesc(`Default texture for iChannel${channelIndex}. Currently set: ${selectedPath.length > 40 ? selectedPath.substring(0, 40) + '...' : selectedPath}`);
								// Update placeholder
								this.refreshImagePlaceholder(setting.settingEl, selectedPath);
							}, this.plugin.settings.textureFolder);
							modal.open();
						});

					// Add folder open icon to browse button
					setTimeout(() => {
						this.addIconToButton(btn.buttonEl, 'folder_open');
					}, 0);

					return btn;
				});

			// Add clear button if there's a value
			if (defaultValue) {
												setting.addButton(button => {
					const btn = button
						.setButtonText('')
						.setTooltip(`Clear iChannel${channelIndex} default`)
						.setWarning()
						.onClick(async () => {
							this.plugin.settings[channelName] = '';
							await this.plugin.saveSettings();
							// Clear placeholder and refresh
							this.refreshImagePlaceholder(setting.settingEl, '');
							this.display(); // Refresh display
						});

					// Add close icon to clear button
					setTimeout(() => {
						this.addIconToButton(btn.buttonEl, 'close');
					}, 0);

					return btn;
				});
			}

			// Add initial placeholder (always shown)
			setTimeout(() => {
				this.createImagePlaceholder(setting.settingEl, defaultValue);
			}, 0);

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
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Add new texture shortcut')
					.onClick(() => {
						this.plugin.settings.textureShortcuts.push({ key: '', path: '' });
						this.plugin.saveSettings();
						this.renderTextureShortcuts(shortcutsContainer);
					});

				// Add plus icon to add shortcut button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'add');
				}, 0);

				return btn;
			});
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
							// Update placeholder
							this.refreshImagePlaceholder(shortcutEl, value);
						});
				})
								.addButton(button => {
					const btn = button
						.setButtonText('')
						.setTooltip('Browse for texture file')
						.onClick(() => {
							const modal = new ImageFileSuggestModal(this.app, (selectedPath) => {
								pathComponent.setValue(selectedPath);
								this.plugin.settings.textureShortcuts[index].path = selectedPath;
								this.plugin.saveSettings();
								// Update placeholder
								this.refreshImagePlaceholder(shortcutEl, selectedPath);
							}, this.plugin.settings.textureFolder);
							modal.open();
						});

					// Add folder open icon to browse button
					setTimeout(() => {
						this.addIconToButton(btn.buttonEl, 'folder_open');
					}, 0);

					return btn;
				})
								.addButton(button => {
					const btn = button
						.setButtonText('')
						.setTooltip('Remove shortcut')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.textureShortcuts.splice(index, 1);
							await this.plugin.saveSettings();
							this.renderTextureShortcuts(container);
						});

					// Add close icon to remove button
					setTimeout(() => {
						this.addIconToButton(btn.buttonEl, 'close');
					}, 0);

					return btn;
				});

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

			// Add initial placeholder (always shown)
			setTimeout(() => {
				this.createImagePlaceholder(shortcutEl, shortcut.path);
			}, 0);
		});
	}
}