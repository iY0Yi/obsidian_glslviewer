import { App, PluginSettingTab, Setting, TextComponent, normalizePath } from 'obsidian';
import { GLSLViewerSettings } from '../types/settings';
import { ImageFileSuggest } from '../ui/image-suggest';
import { FolderSuggest } from '../ui/folder-suggest';
import { GLSLIconName, setGLSLIcon } from '../utils/icons';
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

	// Normalize user-provided paths while allowing empty strings
	private normalizeUserPath(value: string): string {
		const trimmed = value.trim();
		return trimmed ? normalizePath(trimmed) : '';
	}

	// Helper method to add icon to button
	private addIconToButton(buttonEl: HTMLButtonElement, iconName: GLSLIconName): void {
		buttonEl.addClass('icon-only');
		buttonEl.setText('');
		setGLSLIcon(buttonEl, iconName);
	}

	// Helper method to create image placeholder (always shown)
	private createImagePlaceholder(container: HTMLElement, imagePath?: string): HTMLElement {
		// Add class to container for styling
		container.addClass('has-image-placeholder');

		// Create placeholder container
		const placeholderContainer = container.createDiv({ cls: 'setting-image-placeholder' });

		if (imagePath && imagePath.trim()) {
			// Resolve the path and try to load thumbnail
			const resolvedPath = this.resolveTexturePath(imagePath);
			void this.loadImageIntoPlaceholder(placeholderContainer, resolvedPath);
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
		if (!(file instanceof TFile)) { // Ensure it's a file, not a folder
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
		container.empty();
		container.addClass('setting-placeholder-icon');
		const iconHolder = container.createDiv();
		setGLSLIcon(iconHolder, 'imagesmode');
	}

	// Helper method to resolve texture path (same logic as main plugin)
	private resolveTexturePath(pathOrKey: string): string {
		// 1. Check if it's a shortcut key first
		const shortcut = this.plugin.settings.textureShortcuts.find(s => s.key === pathOrKey);
		if (shortcut) {
			// Shortcuts are always relative to texture folder
			if (this.plugin.settings.textureFolder && this.plugin.settings.textureFolder.trim()) {
				return `${this.plugin.settings.textureFolder}/${shortcut.path}`;
			} else {
				return shortcut.path;
			}
		}

		// 2. If texture folder is set, use it as the base directory for texture paths
		if (this.plugin.settings.textureFolder && this.plugin.settings.textureFolder.trim()) {
			return `${this.plugin.settings.textureFolder}/${pathOrKey}`;
		}

		// 3. If no texture folder is set, treat as vault root relative path
		return pathOrKey;
	}

	// Helper method to refresh image placeholder
	private async refreshImagePlaceholder(settingEl: HTMLElement, imagePath: string): Promise<void> {
		// Find existing placeholder
		const existingPlaceholder = settingEl.querySelector('.setting-image-placeholder');
		if (existingPlaceholder instanceof HTMLElement) {
			// Update the placeholder content
			if (imagePath && imagePath.trim()) {
				// Resolve the path for thumbnail display
				const resolvedPath = this.resolveTexturePath(imagePath);
				await this.loadImageIntoPlaceholder(existingPlaceholder, resolvedPath);
			} else {
				this.showDefaultImageIcon(existingPlaceholder);
			}
		} else {
			// Create new placeholder if it doesn't exist
			const resolvedPath = imagePath ? this.resolveTexturePath(imagePath) : imagePath;
			this.createImagePlaceholder(settingEl, resolvedPath);
		}
	}

	// Helper method to refresh image placeholder with absolute path (for file selection)
	private async refreshImagePlaceholderWithAbsolutePath(settingEl: HTMLElement, absolutePath: string): Promise<void> {
		// Find existing placeholder
		const existingPlaceholder = settingEl.querySelector('.setting-image-placeholder');
		if (existingPlaceholder instanceof HTMLElement) {
			// Update the placeholder content with absolute path directly
			if (absolutePath && absolutePath.trim()) {
				await this.loadImageIntoPlaceholder(existingPlaceholder, absolutePath);
			} else {
				this.showDefaultImageIcon(existingPlaceholder);
			}
		} else {
			// Create new placeholder if it doesn't exist with absolute path
			const placeholderContainer = this.createImagePlaceholder(settingEl, '');
			if (absolutePath && absolutePath.trim()) {
				await this.loadImageIntoPlaceholder(placeholderContainer, absolutePath);
			}
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Add specific class to limit CSS scope
		containerEl.addClass('glsl-viewer-settings');

                // Display Settings Section
                new Setting(containerEl)
                        .setName('Display')
                        .setHeading();

		// Default Aspect Ratio setting
                new Setting(containerEl)
                        .setName('Default aspect ratio')
			.setDesc('Default height/width ratio for new GLSL viewers. Common values: 0.5625 (16:9), 0.75 (4:3), 1.0 (square), 1.777 (9:16). Range: 0.1-5.0')
			.addText(text => text
				.setPlaceholder('0.5625')
				.setValue(this.plugin.settings.defaultAspect.toString())
				.onChange((value) => {
					const numValue = parseFloat(value);
					if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 5.0) {
						this.plugin.settings.defaultAspect = numValue;
						void this.plugin.saveSettings();
					}
				})
			)
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Reset to default 16:9 (0.5625)')
					.onClick(() => {
						this.plugin.settings.defaultAspect = 0.5625;
						void this.plugin.saveSettings();
						// Update only the input field value instead of refreshing entire display
						const inputEl = btn.buttonEl.parentElement?.querySelector('input[type="text"]');
						if (inputEl instanceof HTMLInputElement) {
							inputEl.value = '0.5625';
						}
					});

				// Add refresh icon to reset button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

		// Default Autoplay setting
			new Setting(containerEl)
				.setName('Default autoplay')
				.setDesc('Whether new shader viewers should start playing automatically by default (override with the @autoplay directive).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultAutoplay)
				.onChange((value) => {
					this.plugin.settings.defaultAutoplay = value;
					void this.plugin.saveSettings();
				})
			);

		// Default Hide Code setting
			new Setting(containerEl)
				.setName('Default hide code')
				.setDesc('Whether to hide the code block content by default in reading mode (override with the @hideCode directive).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultHideCode)
				.onChange((value) => {
					this.plugin.settings.defaultHideCode = value;
					void this.plugin.saveSettings();
				})
			);

                // Folders Settings Section
                new Setting(containerEl)
                        .setName('Folders')
                        .setHeading();

		// Add horizontal rule
		containerEl.createEl('hr', { cls: 'glsl-settings-divider' });

		// Folders description
		const foldersDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		foldersDesc.createEl('p').textContent = 'Configure folder locations for templates, thumbnails, and texture browsing.';

		// Thumbnails Folder setting (highest priority)
		let thumbnailsFolderTextComponent: TextComponent;
		const thumbnailsSetting = new Setting(containerEl)
		        .setName('Thumbnails folder')
			.setDesc('Folder for storing generated thumbnails (created automatically for non-autoplay shaders).');

		thumbnailsSetting.addText(text => {
			thumbnailsFolderTextComponent = text;
			return text
					.setPlaceholder('GLSL thumbnails')
				.setValue(this.plugin.settings.thumbnailsFolder)
				.onChange((value) => {
					const normalized = this.normalizeUserPath(value);
					if (normalized === this.plugin.settings.thumbnailsFolder) {
						return;
					}
					this.plugin.settings.thumbnailsFolder = normalized;
					void this.plugin.saveSettings();
				});
		});

		thumbnailsSetting.addButton(button => {
			const btn = button
				.setButtonText('')
				.setTooltip('Reset to default')
				.onClick(() => {
						const normalized = this.normalizeUserPath('GLSL thumbnails');
					this.plugin.settings.thumbnailsFolder = normalized;
					thumbnailsFolderTextComponent.setValue(normalized);
					void this.plugin.saveSettings();
				});

			setTimeout(() => {
				this.addIconToButton(btn.buttonEl, 'refresh');
			}, 0);

			return btn;
		});

		new FolderSuggest(this.app, thumbnailsFolderTextComponent.inputEl, (selectedPath) => {
			const normalized = this.normalizeUserPath(selectedPath);
			this.plugin.settings.thumbnailsFolder = normalized;
			thumbnailsFolderTextComponent.setValue(normalized);
			void this.plugin.saveSettings();
		});

		// Texture Folder setting (second priority)
		let textureFolderTextComponent: TextComponent;
		const textureFolderSetting = new Setting(containerEl)
		        .setName('Texture folder')
			.setDesc('Base folder for texture paths in @iChannel directives (all paths except shortcuts are resolved relative to this folder and texture browsing is limited to it).');

		textureFolderSetting.addText(text => {
			textureFolderTextComponent = text;
			return text
				.setPlaceholder('Set your texture folder.')
				.setValue(this.plugin.settings.textureFolder)
				.onChange((value) => {
					const normalized = this.normalizeUserPath(value);
					if (normalized === this.plugin.settings.textureFolder) {
						return;
					}
					this.plugin.settings.textureFolder = normalized;
					void this.plugin.saveSettings();
				});
		});

		textureFolderSetting.addButton(button => {
			const btn = button
				.setButtonText('')
				.setTooltip('Reset to default (empty)')
				.onClick(() => {
					if (!this.plugin.settings.textureFolder.length) {
						textureFolderTextComponent.setValue('');
						return;
					}
					this.plugin.settings.textureFolder = '';
					textureFolderTextComponent.setValue('');
					void this.plugin.saveSettings();
				});

			setTimeout(() => {
				this.addIconToButton(btn.buttonEl, 'refresh');
			}, 0);

			return btn;
		});

		new FolderSuggest(this.app, textureFolderTextComponent.inputEl, (selectedPath) => {
			const normalized = this.normalizeUserPath(selectedPath);
			if (normalized === this.plugin.settings.textureFolder) {
				textureFolderTextComponent.setValue(normalized);
				return;
			}
			this.plugin.settings.textureFolder = normalized;
			textureFolderTextComponent.setValue(normalized);
			void this.plugin.saveSettings();
		});

		// Templates Folder setting (third priority)
		let templatesFolderTextComponent: TextComponent;
		const templatesSetting = new Setting(containerEl)
		        .setName('Templates folder')
			.setDesc('Folder for storing reusable shader templates.');

		templatesSetting.addText(text => {
			templatesFolderTextComponent = text;
			return text
					.setPlaceholder('GLSL templates')
				.setValue(this.plugin.settings.templatesFolder)
				.onChange((value) => {
					const normalized = this.normalizeUserPath(value);
					if (normalized === this.plugin.settings.templatesFolder) {
						return;
					}
					this.plugin.settings.templatesFolder = normalized;
					void this.plugin.saveSettings();
				});
		});

		templatesSetting.addButton(button => {
			const btn = button
				.setButtonText('')
				.setTooltip('Reset to default')
				.onClick(() => {
						const normalized = this.normalizeUserPath('GLSL templates');
					this.plugin.settings.templatesFolder = normalized;
					templatesFolderTextComponent.setValue(normalized);
					void this.plugin.saveSettings();
				});

			setTimeout(() => {
				this.addIconToButton(btn.buttonEl, 'refresh');
			}, 0);

			return btn;
		});

		new FolderSuggest(this.app, templatesFolderTextComponent.inputEl, (selectedPath) => {
			const normalized = this.normalizeUserPath(selectedPath);
			if (normalized === this.plugin.settings.templatesFolder) {
				templatesFolderTextComponent.setValue(normalized);
				return;
			}

			this.plugin.settings.templatesFolder = normalized;
			templatesFolderTextComponent.setValue(normalized);
			void this.plugin.saveSettings();
		});

                // Texture Shortcuts Settings Section (now as main section)
                new Setting(containerEl)
                        .setName('Texture shortcuts')
                        .setHeading();

		// Add horizontal rule
		containerEl.createEl('hr', { cls: 'glsl-settings-divider' });
		const shortcutDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		shortcutDesc.createEl('p').textContent = 'Create shortcuts for frequently used textures (for example, use @iChannel0 tex1).';

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
						void this.plugin.saveSettings();
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

			let pathComponent: TextComponent;

			const setting = new Setting(shortcutEl)
				.addText(text => {
					return text
						.setPlaceholder('Set shorthand name')
						.setValue(shortcut.key)
						.onChange((value) => {
							this.plugin.settings.textureShortcuts[index].key = value;
							void this.plugin.saveSettings();
						});
				})
				.addText(text => {
					pathComponent = text;
					return text
						.setPlaceholder('path/to/texture.png')
						.setValue(shortcut.path)
						.onChange((value) => {
							const normalized = this.normalizeUserPath(value);
							if (this.plugin.settings.textureShortcuts[index].path === normalized) {
								void this.refreshImagePlaceholder(shortcutEl, normalized);
								return;
							}
							this.plugin.settings.textureShortcuts[index].path = normalized;
							void this.plugin.saveSettings();
							// Update placeholder
							void this.refreshImagePlaceholder(shortcutEl, normalized);
						});
				})
				.addButton(button => {
					const btn = button
						.setButtonText('')
						.setTooltip('Remove shortcut')
						.setWarning()
						.onClick(() => {
							this.plugin.settings.textureShortcuts.splice(index, 1);
							void this.plugin.saveSettings();
							this.renderTextureShortcuts(container);
						});

					// Add close icon to remove button
					setTimeout(() => {
						this.addIconToButton(btn.buttonEl, 'close');
					}, 0);

					return btn;
				});

			new ImageFileSuggest(
				this.app,
				pathComponent.inputEl,
				() => this.plugin.settings.textureFolder,
				(selectedPath) => {
					const normalizedSelectedPath = this.normalizeUserPath(selectedPath);
					const textureFolder = this.plugin.settings.textureFolder;
					let finalPath = normalizedSelectedPath;

					if (textureFolder && textureFolder.length && normalizedSelectedPath.startsWith(textureFolder + '/')) {
						finalPath = normalizedSelectedPath.substring(textureFolder.length + 1);
					}

					finalPath = this.normalizeUserPath(finalPath);

					const previousPath = this.plugin.settings.textureShortcuts[index].path;
					this.plugin.settings.textureShortcuts[index].path = finalPath;
					pathComponent.setValue(finalPath);

					if (previousPath !== finalPath) {
						void this.plugin.saveSettings();
					}

					// Update placeholder with absolute path for preview
					void this.refreshImagePlaceholderWithAbsolutePath(shortcutEl, normalizedSelectedPath);
				}
			);

			// Add CSS classes and labels for better UX
			const controls = setting.controlEl;
			const keyInput = controls.querySelector('.setting-item-control input:first-of-type');
			const pathInput = controls.querySelector('.setting-item-control input:nth-of-type(2)');

			if (keyInput instanceof HTMLInputElement) {
				keyInput.addClass('shortcut-key-input');
				keyInput.setAttribute('aria-label', 'Shortcut key');
			}
			if (pathInput instanceof HTMLInputElement) {
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


