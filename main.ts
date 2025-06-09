import { Plugin, MarkdownPostProcessorContext, App, Notice } from 'obsidian';
import { GLSLViewerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { ShaderConfig } from './src/types/shader-config';
import { wrapShaderCode } from './src/utils/shader-templates';
import { GLSLViewerSettingTab } from './src/settings/settings-tab';
import { GLSLRenderer, RendererPlugin } from './src/core/renderer';
import { ViewerContainer } from './src/ui/viewer-container';
import { ControlsManager } from './src/ui/controls';
import { ErrorDisplay } from './src/ui/error-display';
import { ThumbnailManager } from './src/utils/thumbnail-manager';
import { TemplateManager } from './src/utils/template-manager';

export default class GLSLViewerPlugin extends Plugin implements RendererPlugin {
	settings: GLSLViewerSettings;
	activeViewers: Set<GLSLRenderer> = new Set();
	thumbnailManager: ThumbnailManager;
	templateManager: TemplateManager;

	async onload() {
		await this.loadSettings();

		// Initialize managers
		this.thumbnailManager = new ThumbnailManager(this.app);
		this.templateManager = new TemplateManager(this.app);

		// Ensure templates directory exists
		await this.templateManager.ensureTemplatesDir();

		// Add setting tab
		this.addSettingTab(new GLSLViewerSettingTab(this.app, this));

		// Process GLSL code blocks - using unique language name to avoid conflicts
		this.registerMarkdownCodeBlockProcessor('glsl-viewer', (source, el, ctx) => {
			this.processGLSLBlock(source, el, ctx);
		});

				// Process GLSL code blocks with @viewer directive
		this.registerMarkdownCodeBlockProcessor('glsl', (source, el, ctx) => {
			// Check if we're in edit mode by looking at the document structure
			const isEditMode = this.isInEditMode(el);

			if (this.hasViewerDirective(source)) {
				if (isEditMode) {
					this.processGLSLBlockEditMode(source, el, ctx);
				} else {
					this.processGLSLBlockReadingMode(source, el, ctx);
				}
			}
		});


	}

	onunload() {
		// Clean up active viewers
		this.activeViewers.forEach(viewer => {
			try {
				viewer.destroy();
			} catch (e) {
				// Silent cleanup
			}
		});
		this.activeViewers.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
	 * Count active GLSL viewers by checking actual DOM elements
	 */
	private countActiveDOMViewers(): number {
		// Count all .glsl-viewer-container elements in the document
		const containers = document.querySelectorAll('.glsl-viewer-container');
		return containers.length;
	}

	/**
	 * Clean up any existing GLSL viewer in the given element
	 */
	private cleanupExistingViewer(el: HTMLElement) {
		// Find existing GLSL viewer container
		const existingContainer = el.querySelector('.glsl-viewer-container');
		if (existingContainer) {
			// Find the canvas element
			const canvas = existingContainer.querySelector('.glsl-viewer-canvas') as HTMLCanvasElement;
			if (canvas) {
				// Find and destroy the corresponding GLSLRenderer
				for (const viewer of this.activeViewers) {
					if (viewer.getCanvas() === canvas) {
						viewer.destroy();
						break;
					}
				}
			}
			// Remove the existing container from DOM
			existingContainer.remove();
		}
	}

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

	private processGLSLBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Parse shader config from comments
		const config = this.parseShaderConfig(source);

		// Clean up any existing GLSL viewer in this element
		this.cleanupExistingViewer(el);

		// Create viewer container
		const viewerContainer = new ViewerContainer(config, el);

		// Extract actual shader code (remove config comments)
		const shaderCode = this.extractShaderCode(source);

		// Create GLSL viewer
		this.createGLSLViewer(viewerContainer, shaderCode, config);

		// Hide original code block if requested
		if (config.hideCode) {
			const codeBlock = el.querySelector('code');
			if (codeBlock) {
				codeBlock.classList.add('glsl-viewer-hidden');
			}
		}
	}

	private parseShaderConfig(source: string): ShaderConfig {
		const config: ShaderConfig = {
			aspect: this.settings.defaultAspect,
			autoplay: false,
			hideCode: false,
			iChannel0: this.settings.defaultIChannel0 || undefined,
			iChannel1: this.settings.defaultIChannel1 || undefined,
			iChannel2: this.settings.defaultIChannel2 || undefined,
			iChannel3: this.settings.defaultIChannel3 || undefined,
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
			config.iChannel0 = directive.substring(11).trim();
		} else if (directive.startsWith('@iChannel1:')) {
			config.iChannel1 = directive.substring(11).trim();
		} else if (directive.startsWith('@iChannel2:')) {
			config.iChannel2 = directive.substring(11).trim();
		} else if (directive.startsWith('@iChannel3:')) {
			config.iChannel3 = directive.substring(11).trim();
		}
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

	private async createGLSLViewer(viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig) {
		const canvas = viewerContainer.getCanvas();
		const container = viewerContainer.getContainer();

		try {
			// Check if we've reached the maximum number of active viewers
			// Use DOM-based counting for accurate resource limit enforcement
			const currentViewerCount = this.countActiveDOMViewers();
			if (currentViewerCount >= this.settings.maxActiveViewers) {
				ErrorDisplay.createAndShow(container, 'Maximum number of active GLSL viewers reached');
				return;
			}

			// Create GLSL renderer instance
			const glslRenderer = new GLSLRenderer(canvas, this.app, this);

			// Apply template if specified
			let processedShaderCode = shaderCode;
			if (config.template) {
				const templateResult = await this.templateManager.loadAndApplyTemplate(config.template, shaderCode);
				if (templateResult) {
					processedShaderCode = templateResult;
				} else {
					ErrorDisplay.createAndShow(container, `Template not found: ${config.template}`);
					return;
				}
			}

			// Create Shadertoy-compatible shader code
			const fullShaderCode = wrapShaderCode(processedShaderCode, glslRenderer.isWebGL2);

			// Load shader
			const loadResult = glslRenderer.load(fullShaderCode);
			if (!loadResult.success) {
				ErrorDisplay.createAndShow(container, loadResult.error || 'Shader compilation failed!');
				return;
			}

			// Load textures if specified
			await this.loadTextures(glslRenderer, config);

			// Set up controls
			new ControlsManager(viewerContainer, glslRenderer, config);

			// Track active viewer
			this.activeViewers.add(glslRenderer);

			// Start animation if autoplay is enabled
			if (config.autoplay) {
				glslRenderer.play();
			} else {
				// For non-autoplay viewers, generate thumbnail
				this.generateThumbnailIfNeeded(shaderCode, glslRenderer, viewerContainer, config);
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			ErrorDisplay.createAndShow(container, `Unexpected error: ${errorMessage}`);
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
		// Mark as processed to avoid PostProcessor duplication
		el.setAttribute('data-glsl-processed', 'true');

		// Parse shader config from comments
		const config = this.parseShaderConfig(source);

		// Clean up any existing GLSL viewer in this element
		this.cleanupExistingViewer(el);

		// Create viewer container inside el
		const viewerContainer = new ViewerContainer(config, el);

		// Extract actual shader code (remove config comments)
		const shaderCode = this.extractShaderCode(source);

		// Create GLSL viewer
		this.createGLSLViewer(viewerContainer, shaderCode, config);

		// In reading mode, create a clean code block display
		const cleanCode = this.extractShaderCode(source);

		// Create code block element
		const codeBlockContainer = document.createElement('div');
		codeBlockContainer.className = 'glsl-clean-code-container';

		const preElement = document.createElement('pre');
		const codeElement = document.createElement('code');
		codeElement.className = 'language-glsl';
		codeElement.textContent = cleanCode;
		preElement.appendChild(codeElement);
		preElement.classList.add('glsl-code-with-viewer');
		codeBlockContainer.appendChild(preElement);

		// Add to container
		el.appendChild(codeBlockContainer);

		// Hide code block if requested
		if (config.hideCode) {
			codeBlockContainer.classList.add('glsl-viewer-hidden');
		}
	}

	/**
	 * Process GLSL blocks in edit mode (CodeBlockProcessor)
	 */
	private processGLSLBlockEditMode(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Mark as processed to avoid PostProcessor duplication
		el.setAttribute('data-glsl-processed', 'true');

		// Parse shader config from comments
		const config = this.parseShaderConfig(source);

		// Clean up any existing GLSL viewer in this element
		this.cleanupExistingViewer(el);

		// In edit mode, create viewer inside el (the CodeBlockProcessor container)
		const viewerContainer = new ViewerContainer(config, el);

		// Extract actual shader code (remove config comments)
		const shaderCode = this.extractShaderCode(source);

		// Create GLSL viewer
		this.createGLSLViewer(viewerContainer, shaderCode, config);

		// In edit mode, also create a clean code block display
		const cleanCode = this.extractShaderCode(source);

		// Create simple code block element
		const codeBlockContainer = document.createElement('div');
		codeBlockContainer.className = 'glsl-clean-code-container glsl-edit-mode-code';

		const preElement = document.createElement('pre');
		const codeElement = document.createElement('code');
		codeElement.className = 'language-glsl';
		codeElement.textContent = cleanCode;
		preElement.appendChild(codeElement);
		preElement.classList.add('glsl-code-with-viewer');
		codeBlockContainer.appendChild(preElement);

		// Add to container
		el.appendChild(codeBlockContainer);

		// Adjust viewer container margin for edit mode
		const viewerContainerEl = el.querySelector('.glsl-viewer-container');
		if (viewerContainerEl) {
			viewerContainerEl.classList.add('glsl-viewer-edit-mode');
		}

		// Hide code block if requested
		if (config.hideCode) {
			codeBlockContainer.classList.add('glsl-viewer-hidden');
		}
	}
}

