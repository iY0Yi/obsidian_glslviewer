import { Plugin, MarkdownPostProcessorContext, App } from 'obsidian';
import { GLSLViewerSettings, DEFAULT_SETTINGS } from './src/types/settings';
import { ShaderConfig } from './src/types/shader-config';
import { wrapShaderCode } from './src/utils/shader-templates';
import { GLSLViewerSettingTab } from './src/settings/settings-tab';
import { GLSLRenderer, RendererPlugin } from './src/core/renderer';
import { ViewerContainer } from './src/ui/viewer-container';
import { ControlsManager } from './src/ui/controls';
import { ErrorDisplay } from './src/ui/error-display';



export default class GLSLViewerPlugin extends Plugin implements RendererPlugin {
	settings: GLSLViewerSettings;
	activeViewers: Set<GLSLRenderer> = new Set();

	async onload() {
		await this.loadSettings();

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
			if (this.activeViewers.size >= this.settings.maxActiveViewers) {
				ErrorDisplay.createAndShow(container, 'Maximum number of active GLSL viewers reached');
				return;
			}

			// Create GLSL renderer instance
			const glslRenderer = new GLSLRenderer(canvas, this.app, this);

			// Create Shadertoy-compatible shader code
			const fullShaderCode = wrapShaderCode(shaderCode, glslRenderer.isWebGL2);

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
			console.log(`GLSL Viewer: Added viewer, active count: ${this.activeViewers.size}/${this.settings.maxActiveViewers}`);

			// Start animation if autoplay is enabled
			if (config.autoplay) {
				glslRenderer.play();
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Error creating GLSL viewer:', errorMessage);
			ErrorDisplay.createAndShow(container, `Unexpected error: ${errorMessage}`);
		}
	}
}

