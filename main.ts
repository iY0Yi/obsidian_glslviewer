import { Plugin, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, TFile, setIcon } from 'obsidian';
interface PrismLanguageGrammar {
	[key: string]: unknown;
}

interface ObsidianPrism {
	highlight: (code: string, grammar: PrismLanguageGrammar, language: string) => string;
	languages: Record<string, PrismLanguageGrammar>;
}
import { GLSLViewerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { CustomUniform, ShaderConfig } from './src/types/shader-config';
import { wrapShaderCode } from './src/utils/shader-templates';
import { GLSLViewerSettingTab } from './src/settings/settings-tab';
import { GLSLRenderer } from './src/core/renderer';
import { ViewerContainer } from './src/ui/viewer-container';
import { ControlsManager } from './src/ui/controls';
import { ErrorDisplay } from './src/ui/error-display';
import { ThumbnailManager } from './src/utils/thumbnail-manager';
import { TemplateManager } from './src/utils/template-manager';
import { registerGLSLViewerIcons } from './src/utils/icons';

type CodeBlockLocation = {
	sourcePath: string;
	lineStart: number;
	lineEnd: number;
};

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
		// Skip if same renderer is being set again
		if (this.renderer === renderer) {
			return;
		}
		// Remove old renderer from child components if exists
		if (this.renderer) {
			this.removeChild(this.renderer);
		}
		this.renderer = renderer;
		// Add new renderer as child for automatic lifecycle management
		if (renderer) {
			this.addChild(renderer);
			// Explicitly load the component to ensure registerDomEvent works
			renderer.load();
		}
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
		// Renderer is automatically unloaded as child component
		this.renderer = null;
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
				this.createNormalCodeBlock(source, el, ctx);
			}
		});
	}

	async loadSettings() {
		const storedSettings: unknown = await this.loadData();
		if (isPartialGLSLSettings(storedSettings)) {
			this.settings = {
				...DEFAULT_SETTINGS,
				...storedSettings,
			};
		} else {
			this.settings = { ...DEFAULT_SETTINGS };
		}
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
		} catch {
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
		} catch {
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

	private getCodeBlockLocation(el: HTMLElement, ctx: MarkdownPostProcessorContext): CodeBlockLocation | null {
		const sectionInfo = ctx.getSectionInfo(el);
		if (!sectionInfo || !ctx.sourcePath) {
			return null;
		}

		return {
			sourcePath: ctx.sourcePath,
			lineStart: sectionInfo.lineStart,
			lineEnd: sectionInfo.lineEnd,
		};
	}

	private formatDirectiveNumber(value: number): string {
		if (!Number.isFinite(value)) {
			return '0';
		}
		return `${parseFloat(value.toFixed(6))}`;
	}

	private formatColorHex(color: [number, number, number]): string {
		const clamp01 = (num: number): number => Math.max(0, Math.min(1, Number.isFinite(num) ? num : 0));
		const toHex = (num: number): string => Math.round(clamp01(num) * 255).toString(16).padStart(2, '0');
		return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`;
	}

	private buildUniformDirective(uniform: CustomUniform): string {
		switch (uniform.type) {
			case 'toggle':
				return `@toggle: ${uniform.name} ${uniform.value >= 0.5 ? 1 : 0}`;
			case 'color':
				return `@color: ${uniform.name} ${this.formatColorHex(uniform.value)}`;
			default:
				return `@slider: ${uniform.name} ${this.formatDirectiveNumber(uniform.value)} ${this.formatDirectiveNumber(uniform.min)} ${this.formatDirectiveNumber(uniform.max)} ${this.formatDirectiveNumber(uniform.step)}`;
		}
	}

	private replaceUniformDirectiveLines(blockLines: string[], customUniforms: CustomUniform[]): string[] | null {
		const replacements = new Map<string, string>();
		for (const uniform of customUniforms) {
			replacements.set(`${uniform.type}:${uniform.name}`, this.buildUniformDirective(uniform));
		}

		if (replacements.size === 0) {
			return null;
		}

		let replacedCount = 0;
		const updatedLines = blockLines.map((line) => {
			const match = line.match(/^(\s*\/\/\s*)@(slider|toggle|color):\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+.*)?$/);
			if (!match) {
				return line;
			}
			const prefix = match[1];
			const type = match[2];
			const name = match[3];
			const replacement = replacements.get(`${type}:${name}`);
			if (!replacement) {
				return line;
			}
			replacedCount++;
			return `${prefix}${replacement}`;
		});

		return replacedCount > 0 ? updatedLines : null;
	}

	private async persistUniformDefaults(blockLocation: CodeBlockLocation | null, customUniforms: CustomUniform[]): Promise<boolean> {
		if (!blockLocation || customUniforms.length === 0) {
			new Notice('No custom uniforms found to persist.');
			return false;
		}

		const file = this.app.vault.getAbstractFileByPath(blockLocation.sourcePath);
		if (!(file instanceof TFile)) {
			new Notice('Could not locate source note for this shader block.');
			return false;
		}

		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const start = blockLocation.lineStart;
			const end = blockLocation.lineEnd;

			if (start < 0 || end < start || end >= lines.length) {
				new Notice('Shader block location is out of date. Reopen the note and try again.');
				return false;
			}

			const blockLines = lines.slice(start, end + 1);
			const updatedBlockLines = this.replaceUniformDirectiveLines(blockLines, customUniforms);
			if (!updatedBlockLines) {
				new Notice('Could not find matching @slider/@toggle/@color lines to update.');
				return false;
			}

			lines.splice(start, end - start + 1, ...updatedBlockLines);
			await this.app.vault.modify(file, lines.join('\n'));
			new Notice('Shader defaults updated in the code block.');
			return true;
		} catch {
			new Notice('Failed to write shader defaults to note.');
			return false;
		}
	}

	private parseShaderConfig(source: string): ShaderConfig {
		const config: ShaderConfig = {
			aspect: this.settings.defaultAspect,
			autoplay: this.settings.defaultAutoplay,
			hideCode: this.settings.defaultHideCode,
			customUniforms: [],
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
		} else if (directive.startsWith('@slider:')) {
			const sliderArgs = directive.substring(8).trim().split(/\s+/).filter((part) => part.length > 0);
			if (sliderArgs.length >= 4) {
				const name = sliderArgs[0];
				const value = parseFloat(sliderArgs[1]);
				const min = parseFloat(sliderArgs[2]);
				const max = parseFloat(sliderArgs[3]);
				const step = sliderArgs.length >= 5 ? parseFloat(sliderArgs[4]) : 0.01;
				const isValidName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
				if (isValidName && [value, min, max, step].every((num) => Number.isFinite(num)) && max > min && step > 0) {
					config.customUniforms?.push({ type: 'slider', name, value, defaultValue: value, min, max, step });
				}
			}
		} else if (directive.startsWith('@toggle:')) {
			const toggleArgs = directive.substring(8).trim().split(/\s+/).filter((part) => part.length > 0);
			if (toggleArgs.length >= 1) {
				const name = toggleArgs[0];
				const isValidName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
				if (!isValidName) {
					return;
				}

				const rawValue = (toggleArgs.length >= 2 ? toggleArgs[1] : '0').toLowerCase();
				let parsedValue = 0;
				if (rawValue === 'true' || rawValue === 'on' || rawValue === 'yes') {
					parsedValue = 1;
				} else if (rawValue === 'false' || rawValue === 'off' || rawValue === 'no') {
					parsedValue = 0;
				} else {
					const numericValue = parseFloat(rawValue);
					parsedValue = Number.isFinite(numericValue) ? (numericValue >= 0.5 ? 1 : 0) : 0;
				}

				config.customUniforms?.push({ type: 'toggle', name, value: parsedValue, defaultValue: parsedValue, min: 0, max: 1, step: 1 });
			}
		} else if (directive.startsWith('@color:')) {
			const colorArgs = directive.substring(7).trim().split(/\s+/).filter((part) => part.length > 0);
			if (colorArgs.length >= 1) {
				const name = colorArgs[0];
				const isValidName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
				if (!isValidName) {
					return;
				}

				const clamp01 = (num: number): number => Math.max(0, Math.min(1, num));
				const parseHexColor = (token: string): [number, number, number] | null => {
					const normalized = token.replace(/^#/, '');
					if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) {
						return null;
					}
					const expanded = normalized.length === 3
						? normalized.split('').map((ch) => `${ch}${ch}`).join('')
						: normalized;
					return [
						parseInt(expanded.slice(0, 2), 16) / 255,
						parseInt(expanded.slice(2, 4), 16) / 255,
						parseInt(expanded.slice(4, 6), 16) / 255,
					];
				};

				let parsedColor: [number, number, number] = [1, 1, 1];
				if (colorArgs.length >= 2) {
					const hexColor = parseHexColor(colorArgs[1]);
					if (hexColor) {
						parsedColor = hexColor;
					} else if (colorArgs.length >= 4) {
						const r = parseFloat(colorArgs[1]);
						const g = parseFloat(colorArgs[2]);
						const b = parseFloat(colorArgs[3]);
						if ([r, g, b].every((num) => Number.isFinite(num))) {
							parsedColor = [clamp01(r), clamp01(g), clamp01(b)];
						}
					}
				}

				config.customUniforms?.push({
					type: 'color',
					name,
					value: parsedColor,
					defaultValue: [parsedColor[0], parsedColor[1], parsedColor[2]],
					min: 0,
					max: 1,
					step: 0.01,
				});
			}
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

	private async createGLSLViewer(
		viewerContainer: ViewerContainer,
		shaderCode: string,
		config: ShaderConfig,
		child: GLSLViewerChild,
		blockLocation: CodeBlockLocation | null = null,
	) {
		const canvas = viewerContainer.getCanvas();
		const container = viewerContainer.getContainer();

		try {
			if (!config.autoplay) {
				const thumbnailExists = await this.thumbnailManager.thumbnailExists(shaderCode, config);
				if (thumbnailExists) {
					await this.displayThumbnail(shaderCode, viewerContainer, config);
					this.setupLazyRenderer(viewerContainer, shaderCode, config, child, blockLocation);
					return;
				}
			}

			const glslRenderer = new GLSLRenderer(canvas, this.app);
			child.setRenderer(glslRenderer);
			glslRenderer.onContextLost(() => {
				ErrorDisplay.createAndShow(container, 'WebGL context lost (GPU timeout). Try simplifying the shader.');
				child.setRenderer(null);
			});

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

			glslRenderer.setCustomUniformDefinitions(config.customUniforms);
			const fullShaderCode = wrapShaderCode(processedShaderCode, glslRenderer.isWebGL2);

			const loadResult = glslRenderer.loadShader(fullShaderCode);
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
				(renderer) => child.setRenderer(renderer),
				async (customUniforms) => this.persistUniformDefaults(blockLocation, customUniforms),
			);

			if (config.autoplay) {
				glslRenderer.play();
			} else {
				await this.generateThumbnailAndCleanup(shaderCode, glslRenderer, viewerContainer, config, child, blockLocation);
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
	private setupLazyRenderer(
		viewerContainer: ViewerContainer,
		shaderCode: string,
		config: ShaderConfig,
		child: GLSLViewerChild,
		blockLocation: CodeBlockLocation | null = null,
	) {
		const playOverlay = viewerContainer.getPlayOverlay();
		if (playOverlay) {
			const lazyLoadHandler = () => {
				playOverlay.removeEventListener('click', lazyLoadHandler);
				child.registerLazyCleanup();

				viewerContainer.hidePlayOverlay();

				viewerContainer.hidePlaceholder();
				viewerContainer.showCanvas();

				const modifiedConfig = { ...config, autoplay: true };
				void this.createGLSLViewer(viewerContainer, shaderCode, modifiedConfig, child, blockLocation)
					.catch((error) => {
						console.error('Failed to create GLSL viewer during lazy load', error);
						child.setRenderer(null);
						viewerContainer.showPlaceholder();
						viewerContainer.hideCanvas();
						viewerContainer.showPlayOverlay();
						playOverlay.addEventListener('click', lazyLoadHandler);
						child.registerLazyCleanup(() => playOverlay.removeEventListener('click', lazyLoadHandler));
					});
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
		const blockLocation = this.getCodeBlockLocation(el, ctx);

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

		void this.createGLSLViewer(viewerContainer, shaderCode, config, child, blockLocation);

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

			// Add copy button to reading mode code block
			this.addCopyButton(codeBlockContainer, shaderCode);

			wrapper.appendChild(codeBlockContainer);
		}
	}

	/**
	 * Navigate to the code block in the editor (switch to source editing)
	 */
	private navigateToCodeBlock(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const sectionInfo = ctx.getSectionInfo(el);
		if (sectionInfo) {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) {
				editor.setCursor(sectionInfo.lineStart + 1, 0);
				editor.focus();
			}
		}
	}

	/**
	 * Add a copy button to a code block container
	 */
	private addCopyButton(parent: HTMLElement, textToCopy: string) {
		const copyButton = document.createElement('button');
		copyButton.className = 'copy-code-button';
		copyButton.setAttribute('aria-label', 'Copy');
		setIcon(copyButton, 'copy');

		copyButton.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void navigator.clipboard.writeText(textToCopy)
				.then(() => {
					copyButton.setAttribute('aria-label', 'Copied!');
					copyButton.classList.add('is-copied');
					setTimeout(() => {
						copyButton.setAttribute('aria-label', 'Copy');
						copyButton.classList.remove('is-copied');
					}, 1000);
				})
				.catch(() => {
					copyButton.setAttribute('aria-label', 'Copy failed');
					setTimeout(() => {
						copyButton.setAttribute('aria-label', 'Copy');
					}, 1000);
				});
		});

		parent.appendChild(copyButton);
	}

	/**
	 * Process GLSL blocks in edit mode (CodeBlockProcessor)
	 */
	private processGLSLBlockEditMode(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.setAttribute('data-glsl-processed', 'true');

		const config = this.parseShaderConfig(source);
		const shaderCode = this.extractShaderCode(source);
		const blockLocation = this.getCodeBlockLocation(el, ctx);

		const viewerContainer = new ViewerContainer(config, el);
		const child = new GLSLViewerChild(viewerContainer, shaderCode, config);
		ctx.addChild(child);

		void this.createGLSLViewer(viewerContainer, shaderCode, config, child, blockLocation);

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

		// Click on code area to enter source editing (like native code blocks)
		codeBlockContainer.classList.add('glsl-code-clickable');
		codeBlockContainer.addEventListener('click', (e) => {
			// Don't navigate if clicking on copy button
			if ((e.target as HTMLElement).closest('.copy-code-button')) return;
			if ((e.target as HTMLElement).closest('.glsl-edit-code-button')) return;
			this.navigateToCodeBlock(el, ctx);
		});

		// Add copy button to code block
		this.addCopyButton(codeBlockContainer, cleanCode);


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
			const glslRenderer = new GLSLRenderer(canvas, this.app);
			child.setRenderer(glslRenderer);
			glslRenderer.onContextLost(() => {
				ErrorDisplay.createAndShow(container, 'WebGL context lost (GPU timeout). Try simplifying the shader.');
				child.setRenderer(null);
			});

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

			glslRenderer.setCustomUniformDefinitions(config.customUniforms);
			const fullShaderCode = wrapShaderCode(processedShaderCode, glslRenderer.isWebGL2);

			const loadResult = glslRenderer.loadShader(fullShaderCode);
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
	private createNormalCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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

		// Add copy button using shared helper
		this.addCopyButton(el, source);

		// In edit mode: click on code block to enter source editing (like native code blocks)
		if (this.isInEditMode(el)) {
			el.classList.add('glsl-code-clickable');
			el.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('.copy-code-button')) return;
				this.navigateToCodeBlock(el, ctx);
			});
		}

		// Add a class to distinguish from viewer blocks for CSS targeting
		preElement.addClass('glsl-standard-block');

		// Mark as processed
		el.setAttribute('data-glsl-processed', 'true');
	}

	/**
	 * Generate thumbnail and immediately destroy renderer to free WebGL context
	 */
	private async generateThumbnailAndCleanup(
		shaderCode: string,
		glslRenderer: GLSLRenderer,
		viewerContainer: ViewerContainer,
		config: ShaderConfig,
		child: GLSLViewerChild,
		blockLocation: CodeBlockLocation | null = null,
	) {
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

			// Immediately unload the renderer to free WebGL context
			// since this is only for thumbnail generation
			glslRenderer.unload();
			child.setRenderer(null);

			// Set up lazy loading for when user wants to actually view the shader
			this.setupLazyRenderer(viewerContainer, shaderCode, config, child, blockLocation);

		} catch {
			// Clean up renderer even if thumbnail generation failed
			glslRenderer.unload();
			child.setRenderer(null);
			// Setup lazy loading as fallback
			this.setupLazyRenderer(viewerContainer, shaderCode, config, child, blockLocation);
		}
	}
}









function isPartialGLSLSettings(value: unknown): value is Partial<GLSLViewerSettings> {
	return typeof value === 'object' && value !== null;
}
