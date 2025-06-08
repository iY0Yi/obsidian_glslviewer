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
		this.registerMarkdownCodeBlockProcessor('glsl-viewer', this.processGLSLBlock.bind(this));

		// Also register for 'glsl' if available (fallback)
		try {
			this.registerMarkdownCodeBlockProcessor('glsl', this.processGLSLBlock.bind(this));
		} catch (error) {
			console.warn('GLSL processor already registered by another plugin');
		}


	}

	onunload() {
		// Clean up active viewers
		this.activeViewers.forEach(viewer => {
			try {
				viewer.destroy();
			} catch (e) {
				console.warn('Error destroying GLSL viewer:', e);
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
				console.log('GLSL Viewer: Thumbnail already exists, displaying cached version');
				await this.displayThumbnail(shaderCode, viewerContainer, config);
			} else {
				console.log('GLSL Viewer: Generating new thumbnail...');

				// Generate thumbnail at 1 second
				const imageBlob = await glslRenderer.captureAtTime(1.0);
				if (imageBlob) {
					// Save thumbnail
					const savedPath = await this.thumbnailManager.saveThumbnail(shaderCode, imageBlob, config);
					if (savedPath) {
						console.log(`GLSL Viewer: Generated thumbnail: ${savedPath}`);
						await this.displayThumbnail(shaderCode, viewerContainer, config);
					} else {
						console.warn('GLSL Viewer: Failed to save thumbnail');
					}
				} else {
					console.warn('GLSL Viewer: Failed to capture thumbnail');
				}
			}
		} catch (error) {
			console.error('GLSL Viewer: Error in thumbnail generation:', error);
		}
	}

	/**
	 * Display thumbnail as background image in placeholder
	 */
	private async displayThumbnail(shaderCode: string, viewerContainer: ViewerContainer, config: ShaderConfig) {
		try {
			const dataUrl = await this.thumbnailManager.getThumbnailDataUrl(shaderCode, config);
			if (dataUrl) {
				const placeholder = viewerContainer.getPlaceholder();
				placeholder.style.backgroundImage = `url(${dataUrl})`;
				placeholder.style.backgroundSize = 'cover';
				placeholder.style.backgroundPosition = 'center';
				placeholder.style.backgroundRepeat = 'no-repeat';
				console.log('GLSL Viewer: Thumbnail displayed in placeholder');
			} else {
				console.warn('GLSL Viewer: Failed to load thumbnail data URL');
			}
		} catch (error) {
			console.error('GLSL Viewer: Error displaying thumbnail:', error);
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
						console.log('GLSL Viewer: Cleaning up existing viewer before recreating');
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

		// Check if this block should be processed
		if (!this.shouldProcessBlock(source)) {
			return;
		}

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

		const lines = source.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('//')) {
				const comment = trimmed.substring(2).trim();

				if (comment.startsWith('@aspect:')) {
					const aspectValue = parseFloat(comment.substring(8).trim());
					if (!isNaN(aspectValue) && aspectValue > 0) {
						config.aspect = aspectValue;
					}
				} else if (comment.startsWith('@autoplay:')) {
					config.autoplay = comment.substring(10).trim() === 'true';
				} else if (comment.startsWith('@hideCode:')) {
					config.hideCode = comment.substring(10).trim() === 'true';
				} else if (comment.startsWith('@template:')) {
					config.template = comment.substring(10).trim();
				} else if (comment.startsWith('@iChannel0:')) {
					config.iChannel0 = comment.substring(11).trim();
				} else if (comment.startsWith('@iChannel1:')) {
					config.iChannel1 = comment.substring(11).trim();
				} else if (comment.startsWith('@iChannel2:')) {
					config.iChannel2 = comment.substring(11).trim();
				} else if (comment.startsWith('@iChannel3:')) {
					config.iChannel3 = comment.substring(11).trim();
				}
			}
		}

		return config;
	}

	private shouldProcessBlock(source: string): boolean {
		return true; // Always process glsl-viewer code blocks
	}

	private extractShaderCode(source: string): string {
		const lines = source.split('\n');
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
					console.log(`GLSL Viewer: Template applied: ${config.template}`);
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
			const domViewerCount = this.countActiveDOMViewers();
			console.log(`GLSL Viewer: Added viewer, active: ${domViewerCount}/${this.settings.maxActiveViewers}`);

			// Start animation if autoplay is enabled
			if (config.autoplay) {
				glslRenderer.play();
			} else {
				// For non-autoplay viewers, generate thumbnail
				this.generateThumbnailIfNeeded(shaderCode, glslRenderer, viewerContainer, config);
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Error creating GLSL viewer:', errorMessage);
			ErrorDisplay.createAndShow(container, `Unexpected error: ${errorMessage}`);
		}
	}
}

