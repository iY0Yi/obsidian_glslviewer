import { Plugin, MarkdownPostProcessorContext, MarkdownRenderChild, App } from 'obsidian';
import { GLSLViewerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { ShaderConfig } from './src/types/shader-config';
import { wrapShaderCode } from './src/utils/shader-templates';
import { GLSLViewerSettingTab } from './src/settings/settings-tab';
import { GLSLRenderer } from './src/core/renderer';
import { ViewerContainer } from './src/ui/viewer-container';
import { ControlsManager } from './src/ui/controls';
import { ErrorDisplay } from './src/ui/error-display';
import { ThumbnailManager } from './src/utils/thumbnail-manager';
import { TemplateManager } from './src/utils/template-manager';
import { registerGLSLViewerIcons, setGLSLIcon } from './src/utils/icons';

class GLSLViewerChild extends MarkdownRenderChild {
	private renderer: GLSLRenderer | null = null;
	private lazyCleanup: (() => void) | null = null;

	constructor(
		private viewerContainer: ViewerContainer,
		private shaderCode: string,
		private config: ShaderConfig,
	) {
		super(viewerContainer.getContainer());
	}

	getViewerContainer(): ViewerContainer {
		return this.viewerContainer;
	}

	getShaderCode(): string {
		return this.shaderCode;
	}

	getConfig(): ShaderConfig {
		return this.config;
	}

	setRenderer(renderer: GLSLRenderer | null): void {
		this.renderer = renderer;
	}

	registerLazyCleanup(cleanup?: () => void): void {
		if (this.lazyCleanup) {
			this.lazyCleanup();
		}
		this.lazyCleanup = cleanup ?? null;
	}

	onunload(): void {
		if (this.lazyCleanup) {
			this.lazyCleanup();
			this.lazyCleanup = null;
		}
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
		this.containerEl.remove();
	}
}

export default class GLSLViewerPlugin extends Plugin {
	settings: GLSLViewerSettings;
	thumbnailManager: ThumbnailManager;
	templateManager: TemplateManager;

	async onload() {
		await this.loadSettings();
		registerGLSLViewerIcons();

		// Initialize managers
		const pluginDir = this.manifest.dir;
		this.thumbnailManager = new ThumbnailManager(this.app, this.settings, pluginDir);
		this.templateManager = new TemplateManager(this.app, this.settings, pluginDir);

		// Ensure templates directory exists
		await this.templateManager.ensureTemplatesDir();

		// Add setting tab
		this.addSettingTab(new GLSLViewerSettingTab(this.app, this));

		// Process GLSL code blocks with @viewer directive
		this.registerMarkdownCodeBlockProcessor('glsl', (source, el, ctx) => {
			// Only process GLSL code blocks that have @viewer directive
			// Let other plugins (like Shiki highlighter) handle regular GLSL code blocks
			if (this.hasViewerDirective(source)) {
				// Check if we're in edit mode by looking at the document structure
				const isEditMode = this.isInEditMode(el);

				if (isEditMode) {
					this.processGLSLBlockEditMode(source, el, ctx);
				} else {
					this.processGLSLBlockReadingMode(source, el, ctx);
				}
			} else {
				// For GLSL blocks without @viewer directive, preserve the original structure
				// to maintain compatibility with CSS snippets and other plugins
				this.createNormalCodeBlock(source, el);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Reinitialize managers with updated settings
		const pluginDir = this.manifest.dir;
		this.thumbnailManager = new ThumbnailManager(this.app, this.settings, pluginDir);
		this.templateManager = new TemplateManager(this.app, this.settings, pluginDir);
		// Ensure the new templates directory exists
		await this.templateManager.ensureTemplatesDir();
	}

	/**
	 * Generate thumbnail for non-autoplay viewers if needed
	 */
	private async generateThumbnailIfNeeded(shaderCode: string, glslRenderer: GLSLRenderer, viewerContainer: ViewerContainer, config: ShaderConfig) {
		try {
			// Check if thumbnail already exists
			const thumbnailExists = await this.thumbnailManager.thumbnailExists(shaderCode, config);

			if (thumbnailExists) {
				await this.displayThumbnail(shaderCode, viewerContainer, config);
			} else {
				// Generate thumbnail at 1 second
				const imageBlob = await glslRenderer.captureAtTime(1.0);
				if (imageBlob) {
					// Save thumbnail
					const savedPath = await this.thumbnailManager.saveThumbnail(shaderCode, imageBlob, config);
					if (savedPath) {
						await this.displayThumbnail(shaderCode, viewerContainer, config);
					}
				}
			}
		} catch (error) {
			// Silent handling - thumbnails are optional
		}
	}

	/**
	 * Display thumbnail as background image in placeholder
	 */
	private async displayThumbnail(shaderCode: string, viewerContainer: ViewerContainer, config: ShaderConfig) {
		try {
			const dataUrl = await this.thumbnailManager.getThumbnailDataUrl(shaderCode, config);
			if (dataUrl) {
				// Use CSS variables instead of direct style manipulation
				viewerContainer.setThumbnail(dataUrl);
			}
		} catch (error) {
			// Silent handling - thumbnails are optional
		}
	}

	/**
	 * Clean up any existing GLSL viewer in the given element
	 */

	/**
	 * Destroy a viewer container and its associated renderer
	 */

	private async loadTextures(glslRenderer: GLSLRenderer, config: ShaderConfig) {
		const texturePromises: Promise<boolean>[] = [];

		if (config.iChannel0) {
			texturePromises.push(glslRenderer.loadTexture(0, config.iChannel0));
		}
		if (config.iChannel1) {
			texturePromises.push(glslRenderer.loadTexture(1, config.iChannel1));
		}
		if (config.iChannel2) {
			texturePromises.push(glslRenderer.loadTexture(2, config.iChannel2));
		}
		if (config.iChannel3) {
			texturePromises.push(glslRenderer.loadTexture(3, config.iChannel3));
		}

		// Wait for all textures to load (non-blocking, fails silently)
		await Promise.all(texturePromises);
	}

	private parseShaderConfig(source: string): ShaderConfig {
		const config: ShaderConfig = {
			aspect: this.settings.defaultAspect,
			autoplay: this.settings.defaultAutoplay,
			hideCode: this.settings.defaultHideCode,
		};

		// Parse directives from single-line comments (//)
		const lines = source.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('//')) {
				const comment = trimmed.substring(2).trim();
				this.parseDirective(comment, config);
			}
		}

		// Parse directives from multi-line comments (/* */)
		const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;
		let match;
		while ((match = multiLineCommentRegex.exec(source)) !== null) {
			const commentContent = match[0];

			// Remove /* and */ and process content
			const cleanContent = commentContent.replace(/^\/\*/, '').replace(/\*\/$/, '');
			const commentLines = cleanContent.split('\n');

			for (const commentLine of commentLines) {
				const trimmedComment = commentLine.trim();
				// Remove any leading * from comment lines
				const cleanDirective = trimmedComment.replace(/^\*\s*/, '');
				this.parseDirective(cleanDirective, config);
			}
		}

		return config;
	}

	/**
	 * Parse a single directive line and update config
	 */
	private parseDirective(directive: string, config: ShaderConfig) {
		if (directive.startsWith('@aspect:')) {
			const aspectValue = parseFloat(directive.substring(8).trim());
			if (!isNaN(aspectValue) && aspectValue > 0) {
				config.aspect = aspectValue;
			}
		} else if (directive.startsWith('@autoplay:')) {
			config.autoplay = directive.substring(10).trim() === 'true';
		} else if (directive.startsWith('@hideCode:')) {
			config.hideCode = directive.substring(10).trim() === 'true';
		} else if (directive.startsWith('@template:')) {
			config.template = directive.substring(10).trim();
		} else if (directive.startsWith('@iChannel0:')) {
			config.iChannel0 = this.resolveTexturePath(directive.substring(11).trim());
		} else if (directive.startsWith('@iChannel1:')) {
			config.iChannel1 = this.resolveTexturePath(directive.substring(11).trim());
		} else if (directive.startsWith('@iChannel2:')) {
			config.iChannel2 = this.resolveTexturePath(directive.substring(11).trim());
		} else if (directive.startsWith('@iChannel3:')) {
			config.iChannel3 = this.resolveTexturePath(directive.substring(11).trim());
		}
	}

		/**
	 * Resolve texture path from shortcut key, texture folder, or return original path
	 */
	private resolveTexturePath(pathOrKey: string): string {
		// 1. Check if it's a shortcut key first
		const shortcut = this.settings.textureShortcuts.find(s => s.key === pathOrKey);
		if (shortcut) {
			// Shortcuts are always relative to texture folder
			if (this.settings.textureFolder && this.settings.textureFolder.trim()) {
				return `${this.settings.textureFolder}/${shortcut.path}`;
			} else {
				return shortcut.path;
			}
		}

		// 2. If texture folder is set, use it as the base directory for texture paths
		if (this.settings.textureFolder && this.settings.textureFolder.trim()) {
			return `${this.settings.textureFolder}/${pathOrKey}`;
		}

		// 3. If no texture folder is set, treat as vault root relative path
		return pathOrKey;
	}

	private extractShaderCode(source: string): string {
		// First remove multi-line comments that contain directives
		let processedSource = source;

		const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;
		processedSource = processedSource.replace(multiLineCommentRegex, (match) => {
			const commentContent = match;
			const cleanContent = commentContent.replace(/^\/\*/, '').replace(/\*\/$/, '');

			// Check if this comment contains any directives
			const hasDirectives = cleanContent.split('\n').some(line => {
				const trimmed = line.trim().replace(/^\*\s*/, '');
				return trimmed.startsWith('@');
			});

			// If it contains directives, remove it; otherwise keep it
			return hasDirectives ? '' : match;
		});

		// Then filter out single-line comment directives
		const lines = processedSource.split('\n');
		const codeLines = lines.filter(line => {
			const trimmed = line.trim();
			return !trimmed.startsWith('//') || !trimmed.substring(2).trim().startsWith('@');
		});

		return codeLines.join('\n');
	}

	private async createGLSLViewer(viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig, child: GLSLViewerChild) {
		const canvas = viewerContainer.getCanvas();
		const container = viewerContainer.getContainer();

		try {
			if (!config.autoplay) {
				const thumbnailExists = await this.thumbnailManager.thumbnailExists(shaderCode, config);
				if (thumbnailExists) {
					await this.displayThumbnail(shaderCode, viewerContainer, config);
					this.setupLazyRenderer(viewerContainer, shaderCode, config, child);
					return;
				}
			}

                        const glslRenderer = new GLSLRenderer(canvas, this.app, child.registerDomEvent.bind(child));
			child.setRenderer(glslRenderer);

			let processedShaderCode = shaderCode;
			if (config.template) {
				const templateResult = await this.templateManager.loadAndApplyTemplate(config.template, shaderCode);
				if (templateResult) {
					processedShaderCode = templateResult;
				} else {
					ErrorDisplay.createAndShow(container, `Template not found: ${config.template}`);
					child.setRenderer(null);
					return;
				}
			}

			const fullShaderCode = wrapShaderCode(processedShaderCode, glslRenderer.isWebGL2);

			const loadResult = glslRenderer.load(fullShaderCode);
			if (!loadResult.success) {
				ErrorDisplay.createAndShow(container, loadResult.error || 'Shader compilation failed!');
				child.setRenderer(null);
				return;
			}

			await this.loadTextures(glslRenderer, config);

			new ControlsManager(
				viewerContainer,
				glslRenderer,
				config,
				shaderCode,
				async (vc, sc, cfg) => this.recreateRenderer(vc, sc, cfg, child),
				(renderer) => child.setRenderer(renderer)
			);

			if (config.autoplay) {
				glslRenderer.play();
			} else {
				await this.generateThumbnailAndCleanup(shaderCode, glslRenderer, viewerContainer, config, child);
			}
		} catch (error) {
			const errorMessage = (error && typeof error === 'object' && 'message' in error)
				? (error as Error).message
				: String(error);
			ErrorDisplay.createAndShow(container, `Unexpected error: ${errorMessage}`);
			child.setRenderer(null);
		}
	}

	/**
	 * Setup lazy renderer loading for thumbnail-only viewers
	 */
	private setupLazyRenderer(viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig, child: GLSLViewerChild) {
		const playOverlay = viewerContainer.getPlayOverlay();
		if (playOverlay) {
			const lazyLoadHandler = async () => {
				playOverlay.removeEventListener('click', lazyLoadHandler);
				child.registerLazyCleanup();

				viewerContainer.hidePlayOverlay();

				viewerContainer.hidePlaceholder();
				viewerContainer.showCanvas();

				const modifiedConfig = { ...config, autoplay: true };
				await this.createGLSLViewer(viewerContainer, shaderCode, modifiedConfig, child);
			};

			playOverlay.addEventListener('click', lazyLoadHandler);
			child.registerLazyCleanup(() => playOverlay.removeEventListener('click', lazyLoadHandler));
		}
	}

	/**
	 * Quick check for @viewer directive
	 */
	private hasViewerDirective(source: string): boolean {
		// Check for @viewer in single-line comments (//)
		const lines = source.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('//')) {
				const comment = trimmed.substring(2).trim();
				if (comment.startsWith('@viewer')) {
					return true;
				}
			}
		}

		// Check for @viewer in multi-line comments (/* */)
		const multiLineCommentRegex = /\/\*[\s\S]*?\*\//g;
		let match;
		while ((match = multiLineCommentRegex.exec(source)) !== null) {
			const commentContent = match[0];
			// Remove /* and */ and check content
			const cleanContent = commentContent.replace(/^\/\*/, '').replace(/\*\/$/, '');
			const commentLines = cleanContent.split('\n');

			for (const commentLine of commentLines) {
				const trimmedComment = commentLine.trim();
				if (trimmedComment.startsWith('@viewer')) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Check if we're currently in edit mode or reading mode
	 */
	private isInEditMode(el: HTMLElement): boolean {
		// Check if we're inside a CodeMirror editor (edit mode)
		let current: HTMLElement | null = el;
		let depth = 0;
		while (current && depth < 10) {
			if (current.classList.contains('cm-editor') ||
				current.classList.contains('CodeMirror') ||
				current.classList.contains('markdown-source-view') ||
				current.classList.contains('cm-content') ||
				current.classList.contains('workspace-leaf-content') && current.querySelector('.markdown-source-view')) {
				return true;
			}
			current = current.parentElement;
			depth++;
		}

		// Check if we're in reading view
		const readingView = el.closest('.markdown-reading-view') || el.closest('.markdown-preview-view');
		if (readingView) {
			return false;
		}

		// Check document-level classes for edit mode
		const hasEditingClass = document.querySelector('.workspace-leaf.mod-active .markdown-source-view');

		if (hasEditingClass) {
			return true;
		}

		// Default to reading mode
		return false;
	}

	/**
	 * Process GLSL blocks in reading mode (CodeBlockProcessor)
	 */
	private processGLSLBlockReadingMode(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.setAttribute('data-glsl-processed', 'true');

		const config = this.parseShaderConfig(source);
		const shaderCode = this.extractShaderCode(source);

		const parent = el.parentElement;
		if (!parent) {
			return;
		}

		// Create wrapper in place of the original <pre>
		const wrapper = document.createElement('div');
		wrapper.className = 'glsl-viewer-reading-wrapper';
		parent.insertBefore(wrapper, el);
		parent.removeChild(el);

		const viewerContainer = new ViewerContainer(config, wrapper);
		const child = new GLSLViewerChild(viewerContainer, shaderCode, config);
		ctx.addChild(child);

		void this.createGLSLViewer(viewerContainer, shaderCode, config, child);

		if (!config.hideCode) {
			const codeBlockContainer = document.createElement('div');
			codeBlockContainer.className = 'glsl-clean-code-container glsl-reading-mode-code';

			const preElement = el;
			preElement.classList.add('glsl-code-with-viewer');

			const codeElement = preElement.querySelector('code');
			if (codeElement) {
				codeElement.textContent = shaderCode;
				codeElement.classList.add('glsl-code-with-viewer');
			} else {
				preElement.textContent = shaderCode;
			}

			codeBlockContainer.appendChild(preElement);
			wrapper.appendChild(codeBlockContainer);
		}
	}

	/**
	 * Process GLSL blocks in edit mode (CodeBlockProcessor)
	 */
	private processGLSLBlockEditMode(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.setAttribute('data-glsl-processed', 'true');

		const config = this.parseShaderConfig(source);
		const shaderCode = this.extractShaderCode(source);

		const viewerContainer = new ViewerContainer(config, el);
		const child = new GLSLViewerChild(viewerContainer, shaderCode, config);
		ctx.addChild(child);

		void this.createGLSLViewer(viewerContainer, shaderCode, config, child);

		const cleanCode = shaderCode;
		const codeBlockContainer = document.createElement('div');
		codeBlockContainer.className = 'glsl-clean-code-container glsl-edit-mode-code';

		const preElement = document.createElement('pre');
		const codeElement = document.createElement('code');
		codeElement.className = 'language-glsl';
		codeElement.textContent = cleanCode;
		preElement.appendChild(codeElement);
		preElement.classList.add('glsl-code-with-viewer');
		codeBlockContainer.appendChild(preElement);

		el.appendChild(codeBlockContainer);

		const viewerContainerEl = el.querySelector('.glsl-viewer-container');
		if (viewerContainerEl) {
			viewerContainerEl.classList.add('glsl-viewer-edit-mode');
		}

		if (config.hideCode) {
			codeBlockContainer.classList.add('glsl-viewer-hidden');
		}
	}

	/**
	 * Recreate renderer after stop (callback for ControlsManager)
	 */
	private async recreateRenderer(viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig, child: GLSLViewerChild): Promise<GLSLRenderer | null> {
		const canvas = viewerContainer.getCanvas();
		const container = viewerContainer.getContainer();

		try {
                        const glslRenderer = new GLSLRenderer(canvas, this.app, child.registerDomEvent.bind(child));
			child.setRenderer(glslRenderer);

			let processedShaderCode = shaderCode;
			if (config.template) {
				const templateResult = await this.templateManager.loadAndApplyTemplate(config.template, shaderCode);
				if (templateResult) {
					processedShaderCode = templateResult;
				} else {
					ErrorDisplay.createAndShow(container, `Template not found: ${config.template}`);
					child.setRenderer(null);
					return null;
				}
			}

			const fullShaderCode = wrapShaderCode(processedShaderCode, glslRenderer.isWebGL2);

			const loadResult = glslRenderer.load(fullShaderCode);
			if (!loadResult.success) {
				ErrorDisplay.createAndShow(container, loadResult.error || 'Shader compilation failed!');
				child.setRenderer(null);
				return null;
			}

			await this.loadTextures(glslRenderer, config);

			return glslRenderer;

		} catch (error) {
			const errorMessage = (error && typeof error === 'object' && 'message' in error)
				? (error as Error).message
				: String(error);
			ErrorDisplay.createAndShow(container, `Unexpected error: ${errorMessage}`);
			child.setRenderer(null);
			return null;
		}
	}

			/**
	 * Create normal code block for GLSL code without @viewer directive
	 * This function recreates the exact Obsidian reading mode code block structure
	 * to maintain compatibility with CSS snippets and other plugins (like Shiki highlighter).
	 */
	private createNormalCodeBlock(source: string, el: HTMLElement) {
		// We must recreate the exact Obsidian reading mode code block structure
		// because registerMarkdownCodeBlockProcessor gives us complete control

		// Clear the element (this is necessary since we're taking full control)
		el.empty();

		// Add the outer container class that Obsidian uses
		el.addClass('el-pre');

		// Create the exact Obsidian reading mode structure
		const preElement = el.createEl('pre', {
			cls: 'language-glsl',
			attr: { tabindex: '0' }
		});

		const codeElement = preElement.createEl('code', {
			cls: 'language-glsl is-loaded',
			attr: { 'data-line': '0' }
		});

		// Set the code content as plain text initially
		codeElement.textContent = source;

		// Apply syntax highlighting using Prism after a short delay
		// Using secure DOM manipulation instead of innerHTML
		setTimeout(() => {
			try {
				// Access Obsidian's global Prism instance with proper type definition
				interface PrismLanguageGrammar {
					[key: string]: any;
				}

				interface ObsidianPrism {
					highlight: (code: string, grammar: PrismLanguageGrammar, language: string) => string;
					languages: { [key: string]: PrismLanguageGrammar };
				}

				// Check if Prism is available in the global scope with type safety
				if (typeof window !== 'undefined' && 'Prism' in window) {
					const prism = (window as { Prism?: ObsidianPrism }).Prism;
					if (prism && prism.highlight && prism.languages) {
						// Use GLSL language if available, fallback to C-like syntax for basic highlighting
						const language = prism.languages.glsl || prism.languages.c || prism.languages.clike;
						if (language) {
														// Get highlighted code from Prism
							const highlightedCode = prism.highlight(source, language, 'glsl');

							// Safely parse the highlighted HTML using DOMParser to avoid innerHTML security risks
							const parser = new DOMParser();
							const doc = parser.parseFromString(`<div>${highlightedCode}</div>`, 'text/html');
							const parsedDiv = doc.body.firstElementChild;

							if (parsedDiv) {
								// Clear the code element and append parsed nodes
								codeElement.empty();
								while (parsedDiv.firstChild) {
									codeElement.appendChild(parsedDiv.firstChild);
								}
							}
						}
					}
				}
			} catch (error) {
				// Silent fallback - keep plain text if highlighting fails
				console.debug('GLSL syntax highlighting failed:', error);
			}
		}, 100); // Short delay to ensure Prism has been initialized by Obsidian

		// Add the copy button (standard Obsidian feature)
		const copyButton = el.createEl('button', {
			cls: 'copy-code-button'
		});
		copyButton.setAttribute('aria-label', 'Copy');
		copyButton.setText('');
		setGLSLIcon(copyButton, 'copy');

		// Add copy functionality
		copyButton.addEventListener('click', async (e) => {
			e.preventDefault();
			await navigator.clipboard.writeText(source);

			// Show feedback
			copyButton.setAttribute('aria-label', 'Copied!');
			setTimeout(() => {
				copyButton.setAttribute('aria-label', 'Copy');
			}, 1000);
		});

		// Add a class to distinguish from viewer blocks for CSS targeting
		preElement.addClass('glsl-standard-block');

		// Mark as processed
		el.setAttribute('data-glsl-processed', 'true');
	}

	/**
	 * Generate thumbnail and immediately destroy renderer to free WebGL context
	 */
	private async generateThumbnailAndCleanup(shaderCode: string, glslRenderer: GLSLRenderer, viewerContainer: ViewerContainer, config: ShaderConfig, child: GLSLViewerChild) {
		try {
			// Check if thumbnail already exists
			const thumbnailExists = await this.thumbnailManager.thumbnailExists(shaderCode, config);

			if (thumbnailExists) {
				// Display existing thumbnail
				await this.displayThumbnail(shaderCode, viewerContainer, config);
			} else {
				// Generate thumbnail at 1 second
				const imageBlob = await glslRenderer.captureAtTime(1.0);
				if (imageBlob) {
					// Save thumbnail
					const savedPath = await this.thumbnailManager.saveThumbnail(shaderCode, imageBlob, config);
					if (savedPath) {
						await this.displayThumbnail(shaderCode, viewerContainer, config);
					}
				}
			}

			// Immediately destroy the renderer to free WebGL context
			// since this is only for thumbnail generation
			glslRenderer.destroy();
			child.setRenderer(null);

			// Set up lazy loading for when user wants to actually view the shader
			this.setupLazyRenderer(viewerContainer, shaderCode, config, child);

		} catch (error) {
			// Clean up renderer even if thumbnail generation failed
			glslRenderer.destroy();
			child.setRenderer(null);
			// Setup lazy loading as fallback
			this.setupLazyRenderer(viewerContainer, shaderCode, config, child);
		}
	}
}









