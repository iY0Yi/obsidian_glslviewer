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
			// Resolve the path and try to load thumbnail
			const resolvedPath = this.resolveTexturePath(imagePath);
			this.loadImageIntoPlaceholder(placeholderContainer, resolvedPath);
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
		if (existingPlaceholder) {
			// Update the placeholder content
			if (imagePath && imagePath.trim()) {
				// Resolve the path for thumbnail display
				const resolvedPath = this.resolveTexturePath(imagePath);
				await this.loadImageIntoPlaceholder(existingPlaceholder as HTMLElement, resolvedPath);
			} else {
				this.showDefaultImageIcon(existingPlaceholder as HTMLElement);
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
		if (existingPlaceholder) {
			// Update the placeholder content with absolute path directly
			if (absolutePath && absolutePath.trim()) {
				await this.loadImageIntoPlaceholder(existingPlaceholder as HTMLElement, absolutePath);
			} else {
				this.showDefaultImageIcon(existingPlaceholder as HTMLElement);
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

		containerEl.createEl('h2', { text: 'GLSL Viewer Settings' });

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
						// Update only the input field value instead of refreshing entire display
						const inputEl = btn.buttonEl.parentElement?.querySelector('input[type="text"]') as HTMLInputElement;
						if (inputEl) {
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

		// Folders Settings Section
		containerEl.createEl('h3', { text: 'Folders' });

		// Add horizontal rule
		containerEl.createEl('hr', { cls: 'glsl-settings-divider' });

		// Folders description
		const foldersDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		foldersDesc.createEl('p').textContent = 'Configure folder locations for templates, thumbnails, and texture browsing.';

		// Thumbnails Folder setting (highest priority)
		let thumbnailsFolderTextComponent: TextComponent;
		new Setting(containerEl)
			.setName('Thumbnails Folder')
			.setDesc('Folder for storing generated thumbnails. Thumbnails are automatically created for non-autoplay shaders.')
			.addText(text => {
				thumbnailsFolderTextComponent = text;
				return text
					.setPlaceholder('GLSL Thumbnails')
					.setValue(this.plugin.settings.thumbnailsFolder)
					.onChange(async (value) => {
						this.plugin.settings.thumbnailsFolder = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Browse for folder')
					.onClick(() => {
						const modal = new FolderSuggestModal(this.app, (selectedPath) => {
							thumbnailsFolderTextComponent.setValue(selectedPath);
							this.plugin.settings.thumbnailsFolder = selectedPath;
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
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.thumbnailsFolder = 'GLSL Thumbnails';
						await this.plugin.saveSettings();
						thumbnailsFolderTextComponent.setValue('GLSL Thumbnails');
					});

				// Add refresh icon to reset button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

		// Texture Folder setting (second priority)
		let textureFolderTextComponent: TextComponent;
		new Setting(containerEl)
			.setName('Texture Folder')
			.setDesc('Base folder for texture paths in @iChannel directives. When set, all texture paths (except shortcuts) are resolved relative to this folder. Also limits texture browsing to this folder.')
			.addText(text => {
				textureFolderTextComponent = text;
				return text
					.setPlaceholder('assets/textures')
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
					.setTooltip('Reset to default (empty)')
					.onClick(async () => {
						this.plugin.settings.textureFolder = '';
						await this.plugin.saveSettings();
						textureFolderTextComponent.setValue('');
					});

				// Add refresh icon to reset button (unified with others)
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

		// Templates Folder setting (third priority)
		let templatesFolderTextComponent: TextComponent;
		new Setting(containerEl)
			.setName('Templates Folder')
			.setDesc('Folder for storing GLSL templates. Templates enable reusing complex setups across multiple shaders.')
			.addText(text => {
				templatesFolderTextComponent = text;
				return text
					.setPlaceholder('GLSL Templates')
					.setValue(this.plugin.settings.templatesFolder)
					.onChange(async (value) => {
						this.plugin.settings.templatesFolder = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => {
				const btn = button
					.setButtonText('')
					.setTooltip('Browse for folder')
					.onClick(() => {
						const modal = new FolderSuggestModal(this.app, (selectedPath) => {
							templatesFolderTextComponent.setValue(selectedPath);
							this.plugin.settings.templatesFolder = selectedPath;
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
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.templatesFolder = 'GLSL Templates';
						await this.plugin.saveSettings();
						templatesFolderTextComponent.setValue('GLSL Templates');
					});

				// Add refresh icon to reset button
				setTimeout(() => {
					this.addIconToButton(btn.buttonEl, 'refresh');
				}, 0);

				return btn;
			});

		// Texture Shortcuts Settings Section (now as main section)
		containerEl.createEl('h3', { text: 'Texture Shortcuts' });

		// Add horizontal rule
		containerEl.createEl('hr', { cls: 'glsl-settings-divider' });
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
								// Convert to relative path if Texture Folder is set
								let finalPath = selectedPath;
								if (this.plugin.settings.textureFolder &&
									this.plugin.settings.textureFolder.trim() &&
									selectedPath.startsWith(this.plugin.settings.textureFolder + '/')) {
									finalPath = selectedPath.substring(this.plugin.settings.textureFolder.length + 1);
								}

								pathComponent.setValue(finalPath);
								this.plugin.settings.textureShortcuts[index].path = finalPath;
								this.plugin.saveSettings();
								// Update placeholder with original absolute path for thumbnail display
								this.refreshImagePlaceholderWithAbsolutePath(shortcutEl, selectedPath);
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