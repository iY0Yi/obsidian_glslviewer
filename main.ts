import { Plugin, MarkdownPostProcessorContext, App, PluginSettingTab, Setting } from 'obsidian';

interface GLSLViewerSettings {
	maxActiveViewers: number;
	defaultAspect: number;
	defaultIChannel0: string;
	defaultIChannel1: string;
	defaultIChannel2: string;
	defaultIChannel3: string;
}

const DEFAULT_SETTINGS: GLSLViewerSettings = {
	maxActiveViewers: 10,
	defaultAspect: 0.5625, // 16:9 aspect ratio (9/16)
	defaultIChannel0: '',
	defaultIChannel1: '',
	defaultIChannel2: '',
	defaultIChannel3: '',
};

interface ShaderConfig {
	aspect: number;
	autoplay: boolean;
	hideCode: boolean;
	iChannel0?: string;
	iChannel1?: string;
	iChannel2?: string;
	iChannel3?: string;
}

class GLSLRenderer {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private program: WebGLProgram | null = null;
	private animationId: number | null = null;
	private startTime: number = Date.now();
	private frameCount: number = 0;
	private lastTime: number = 0;
	private uniforms: { [key: string]: WebGLUniformLocation } = {};
	private textures: { [key: string]: WebGLTexture } = {};
	private app: App;
	public isWebGL2: boolean;
	private plugin: GLSLViewerPlugin; // Reference to plugin for cleanup
	private isDestroyed: boolean = false; // Track if destroy has been called

	// Mouse tracking (Shadertoy compatible)
	private mousePosX: number = 0;
	private mousePosY: number = 0;
	private mouseOriX: number = 0;
	private mouseOriY: number = 0;
	private mouseIsDown: boolean = false;

	constructor(canvas: HTMLCanvasElement, app: App, plugin: GLSLViewerPlugin) {
		this.canvas = canvas;
		this.app = app;
		this.plugin = plugin;

								// Try WebGL2 first, fallback to WebGL1
		const webgl2Context = canvas.getContext('webgl2') as WebGL2RenderingContext;
		if (webgl2Context) {
			this.gl = webgl2Context;
			this.isWebGL2 = true;
		} else {
			const webgl1Context = canvas.getContext('webgl') as WebGLRenderingContext || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
			if (!webgl1Context) {
				throw new Error('WebGL not supported');
			}
			this.gl = webgl1Context;
			this.isWebGL2 = false;
		}

		console.log(`GLSL Viewer: Using ${this.isWebGL2 ? 'WebGL2' : 'WebGL1'}`);

		// Set up mouse tracking
		this.setupMouseTracking();

		// Set up automatic cleanup when canvas is removed from DOM
		this.setupDOMObserver();
	}

	private setupMouseTracking() {
		const calcMouseX = (ev: MouseEvent): number => {
			const rect = this.canvas.getBoundingClientRect();
			return Math.floor(((ev.clientX - rect.left) / (rect.right - rect.left)) * this.canvas.width);
		};

		const calcMouseY = (ev: MouseEvent): number => {
			const rect = this.canvas.getBoundingClientRect();
			return Math.floor(this.canvas.height - ((ev.clientY - rect.top) / (rect.bottom - rect.top)) * this.canvas.height);
		};

		const onCanvas = (ev: MouseEvent): boolean => {
			const rect = this.canvas.getBoundingClientRect();
			return ev.clientX >= rect.left && ev.clientX <= rect.right &&
			       ev.clientY >= rect.top && ev.clientY <= rect.bottom;
		};

		this.canvas.addEventListener('mousedown', (ev) => {
			if (ev.button === 2 || !onCanvas(ev)) return; // Skip right click or outside canvas

			this.mouseIsDown = true;
			this.mouseOriX = calcMouseX(ev);
			this.mouseOriY = calcMouseY(ev);
			this.mousePosX = this.mouseOriX;
			this.mousePosY = this.mouseOriY;
		});

		this.canvas.addEventListener('mouseup', (ev) => {
			if (!onCanvas(ev)) return;

			this.mouseIsDown = false;
			// Make click origin negative when released (Shadertoy behavior)
			this.mouseOriX = Math.abs(this.mouseOriX) * -1;
			this.mouseOriY = Math.abs(this.mouseOriY) * -1;
		});

		this.canvas.addEventListener('mousemove', (ev) => {
			if (!onCanvas(ev)) return;

			if (this.mouseIsDown) {
				// Update position during drag
				this.mousePosX = calcMouseX(ev);
				this.mousePosY = calcMouseY(ev);
				// Keep origin positive during drag
				this.mouseOriX = Math.abs(this.mouseOriX);
				this.mouseOriY = Math.abs(this.mouseOriY);
			}
		});

		this.canvas.addEventListener('mouseleave', () => {
			if (this.mouseIsDown) {
				this.mouseIsDown = false;
				this.mouseOriX = Math.abs(this.mouseOriX) * -1;
				this.mouseOriY = Math.abs(this.mouseOriY) * -1;
			}
		});
	}

	private setupDOMObserver() {
		// Use MutationObserver to detect when canvas is removed from DOM
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.removedNodes.forEach((node) => {
					if (node === this.canvas || (node as Element).contains?.(this.canvas)) {
						// Canvas was removed from DOM, clean up
						this.destroy();
						observer.disconnect();
					}
				});
			});
		});

		// Observe the parent container for child removals
		if (this.canvas.parentNode) {
			observer.observe(this.canvas.parentNode, { childList: true, subtree: true });
		}
	}

	load(fragmentShader: string): { success: boolean; error?: string } {
				// Create vertex shader that matches the WebGL version
		const vertexShader = this.isWebGL2 ?
			`#version 300 es
			precision mediump float;
			in vec4 position;
			void main() {
				gl_Position = position;
			}` :
			`precision mediump float;
			attribute vec4 position;
			void main() {
				gl_Position = position;
			}`;

		try {
			const result = this.createProgram(vertexShader, fragmentShader);
			if (!result.success) {
				return { success: false, error: result.error };
			}

			this.program = result.program!;
			this.setupUniforms();
			this.setupGeometry();
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Shader compilation error:', errorMessage);
			return { success: false, error: errorMessage };
		}
	}

	private createProgram(vertexSource: string, fragmentSource: string): { success: boolean; error?: string; program?: WebGLProgram } {
		const gl = this.gl;

		const vertexResult = this.createShader(gl.VERTEX_SHADER, vertexSource);
		if (!vertexResult.success) {
			return { success: false, error: `Vertex shader error:\n${vertexResult.error}` };
		}

		const fragmentResult = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
		if (!fragmentResult.success) {
			return { success: false, error: `Fragment shader error:\n${fragmentResult.error}` };
		}

		const program = gl.createProgram();
		if (!program) {
			return { success: false, error: 'Failed to create WebGL program' };
		}

		gl.attachShader(program, vertexResult.shader!);
		gl.attachShader(program, fragmentResult.shader!);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const rawLinkError = gl.getProgramInfoLog(program) || 'Unknown link error';
			// Remove control characters except newlines (\n, \r)
			const linkError = rawLinkError.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
			gl.deleteProgram(program);
			return { success: false, error: `Program link error:\n${linkError}` };
		}

		return { success: true, program };
	}

	private createShader(type: number, source: string): { success: boolean; error?: string; shader?: WebGLShader } {
		const gl = this.gl;
		const shader = gl.createShader(type);
		if (!shader) {
			return { success: false, error: 'Failed to create shader' };
		}

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const rawError = gl.getShaderInfoLog(shader) || 'Unknown compilation error';
			// Remove control characters except newlines (\n, \r)
			const compileError = rawError.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
			gl.deleteShader(shader);
			return { success: false, error: compileError };
		}

		return { success: true, shader };
	}

			private setupUniforms() {
		if (!this.program) return;

		const gl = this.gl;
		gl.useProgram(this.program);

		// Get uniform locations (Shadertoy standard uniforms)
		this.uniforms.iResolution = gl.getUniformLocation(this.program, 'iResolution')!;
		this.uniforms.iTime = gl.getUniformLocation(this.program, 'iTime')!;
		this.uniforms.iTimeDelta = gl.getUniformLocation(this.program, 'iTimeDelta')!;
		this.uniforms.iFrame = gl.getUniformLocation(this.program, 'iFrame')!;
		this.uniforms.iMouse = gl.getUniformLocation(this.program, 'iMouse')!;
		this.uniforms.iDate = gl.getUniformLocation(this.program, 'iDate')!;

		// Texture uniforms
		this.uniforms.iChannel0 = gl.getUniformLocation(this.program, 'iChannel0')!;
		this.uniforms.iChannel1 = gl.getUniformLocation(this.program, 'iChannel1')!;
		this.uniforms.iChannel2 = gl.getUniformLocation(this.program, 'iChannel2')!;
		this.uniforms.iChannel3 = gl.getUniformLocation(this.program, 'iChannel3')!
	}

	private setupGeometry() {
		const gl = this.gl;

		// Create a full-screen quad
		const positions = new Float32Array([
			-1, -1,
			 1, -1,
			-1,  1,
			 1,  1,
		]);

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

		// WebGL1/2 both use the same attribute functions, but attribute name is 'position'
		const positionLocation = gl.getAttribLocation(this.program!, 'position');
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	}

	play() {
		if (this.animationId) return;
		this.startTime = Date.now();
		this.lastTime = 0;
		this.frameCount = 0;
		this.animate();
	}

	pause() {
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	private animate = () => {
		this.render();
		this.animationId = requestAnimationFrame(this.animate);
	}

	private render() {
		if (!this.program) return;

		const gl = this.gl;
		gl.useProgram(this.program);

		// Set viewport
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);

		// Update uniforms
		const currentTime = (Date.now() - this.startTime) / 1000;
		const timeDelta = currentTime - this.lastTime;
		this.lastTime = currentTime;
		this.frameCount++;

		// Shadertoy standard uniforms
		gl.uniform3f(this.uniforms.iResolution, this.canvas.width, this.canvas.height, 1.0);
		gl.uniform1f(this.uniforms.iTime, currentTime);
		gl.uniform1f(this.uniforms.iTimeDelta, timeDelta);
		gl.uniform1i(this.uniforms.iFrame, this.frameCount);

		// Mouse position (Shadertoy compatible)
		gl.uniform4f(this.uniforms.iMouse, this.mousePosX, this.mousePosY, this.mouseOriX, this.mouseOriY);

				// Date uniform (year, month, day, seconds)
		const now = new Date();
		gl.uniform4f(this.uniforms.iDate,
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
		);

		// Bind textures
		for (let i = 0; i < 4; i++) {
			const channelName = `iChannel${i}`;
			if (this.textures[channelName]) {
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, this.textures[channelName]);
				gl.uniform1i(this.uniforms[channelName], i);
			}
		}

		// Draw
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

		async loadTexture(channelIndex: number, imagePath: string): Promise<boolean> {
		return new Promise(async (resolve) => {
			const gl = this.gl;
			const img = new Image();

			// Resolve Obsidian vault path
			let resolvedPath = imagePath;
			try {
				// If path doesn't start with http/data/blob, treat as vault-relative
				if (!imagePath.match(/^(https?:\/\/|data:|blob:)/)) {
					// Remove leading slash if present
					const vaultPath = imagePath.replace(/^\//, '');
					const file = this.app.vault.getAbstractFileByPath(vaultPath);
					if (file) {
						resolvedPath = this.app.vault.adapter.getResourcePath(vaultPath);
					}
				}
			} catch (error) {
				console.warn(`Failed to resolve vault path: ${imagePath}`, error);
			}

			img.onload = () => {
				const texture = gl.createTexture();
				if (!texture) {
					resolve(false);
					return;
				}

							gl.bindTexture(gl.TEXTURE_2D, texture);

			// Flip texture vertically to match standard image coordinates
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

			// Set texture parameters with repeat wrapping
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

				this.textures[`iChannel${channelIndex}`] = texture;
				resolve(true);
			};

			img.onerror = () => {
				console.warn(`Failed to load texture: ${resolvedPath} (original: ${imagePath})`);
				resolve(false);
			};

			img.src = resolvedPath;
		});
	}

	destroy() {
		if (this.isDestroyed) return; // Prevent multiple calls
		this.isDestroyed = true;

		this.pause();

		// Clean up textures
		const gl = this.gl;
		Object.values(this.textures).forEach(texture => {
			gl.deleteTexture(texture);
		});
		this.textures = {};

		if (this.program) {
			gl.deleteProgram(this.program);
		}

		// Remove from active viewers list (check if plugin still exists)
		if (this.plugin && this.plugin.activeViewers) {
			this.plugin.activeViewers.delete(this);
			console.log(`GLSL Viewer: Removed viewer, active count: ${this.plugin.activeViewers.size}/${this.plugin.settings.maxActiveViewers}`);
		}
	}
}

export default class GLSLViewerPlugin extends Plugin {
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

	private getSVGIcon(iconName: string): string {
		const icons = {
			play: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>`,
			pause: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Zm400-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z"/></svg>`,
			skull: `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M240-80v-170q-39-17-68.5-45.5t-50-64.5q-20.5-36-31-77T80-520q0-158 112-259t288-101q176 0 288 101t112 259q0 42-10.5 83t-31 77q-20.5 36-50 64.5T720-250v170H240Zm80-80h40v-80h80v80h80v-80h80v80h40v-142q38-9 67.5-30t50-50q20.5-29 31.5-64t11-74q0-125-88.5-202.5T480-800q-143 0-231.5 77.5T160-520q0 39 11 74t31.5 64q20.5 29 50.5 50t67 30v142Zm100-200h120l-60-120-60 120Zm-80-80q33 0 56.5-23.5T420-520q0-33-23.5-56.5T340-600q-33 0-56.5 23.5T260-520q0 33 23.5 56.5T340-440Zm280 0q33 0 56.5-23.5T700-520q0-33-23.5-56.5T620-600q-33 0-56.5 23.5T540-520q0 33 23.5 56.5T620-440ZM480-160Z"/></svg>`
		};
		return icons[iconName as keyof typeof icons] || '';
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
		const container = this.createViewerContainer(config, el);

		// Extract actual shader code (remove config comments)
		const shaderCode = this.extractShaderCode(source);

		// Create GLSL viewer
		this.createGLSLViewer(container, shaderCode, config);

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

		private createViewerContainer(config: ShaderConfig, parentEl: HTMLElement): HTMLElement {
		const container = document.createElement('div');
		container.className = 'glsl-viewer-container';
		container.style.position = 'relative'; // Enable absolute positioning for children
		parentEl.appendChild(container);

		// Create placeholder div for initial area reservation (only for non-autoplay)
		const placeholder = document.createElement('div');
		placeholder.className = 'glsl-viewer-placeholder';
		placeholder.style.width = '100%';
		placeholder.style.aspectRatio = (1 / config.aspect).toString();
		placeholder.style.backgroundColor = '#000';
		placeholder.style.display = config.autoplay ? 'none' : 'block';
		container.appendChild(placeholder);

		// Create canvas
		const canvas = document.createElement('canvas');
		canvas.className = 'glsl-viewer-canvas';

		// Calculate canvas resolution based on aspect ratio
		const baseResolution = 800; // Base width resolution
		canvas.width = baseResolution;
		canvas.height = Math.round(baseResolution * config.aspect);

		canvas.style.width = '100%';
		canvas.style.aspectRatio = (1 / config.aspect).toString();
		canvas.style.display = config.autoplay ? 'block' : 'none'; // Show canvas only when autoplay
		container.appendChild(canvas);

		// Create controls
		const controls = document.createElement('div');
		controls.className = 'glsl-viewer-controls';
		container.appendChild(controls);

		// Create pause-only button (only shown when playing)
		const playButton = document.createElement('button');
		playButton.className = 'glsl-viewer-button';
		playButton.innerHTML = this.getSVGIcon('pause');
		playButton.style.display = config.autoplay ? 'block' : 'none'; // Only show when playing
		controls.appendChild(playButton);

		// Create play overlay (shown initially if not autoplay)
		if (!config.autoplay) {
			const playOverlay = document.createElement('button');
			playOverlay.className = 'glsl-viewer-play-overlay';
			playOverlay.innerHTML = this.getSVGIcon('play');
			container.appendChild(playOverlay);
		}

		return container;
	}

	private async createGLSLViewer(container: HTMLElement, shaderCode: string, config: ShaderConfig) {
		const canvas = container.querySelector('canvas') as HTMLCanvasElement;
		if (!canvas) return;

		try {
			// Check if we've reached the maximum number of active viewers
			if (this.activeViewers.size >= this.settings.maxActiveViewers) {
				this.showError(container, 'Maximum number of active GLSL viewers reached');
				return;
			}

						// Create GLSL renderer instance
			const glslRenderer = new GLSLRenderer(canvas, this.app, this);

			// Create Shadertoy-compatible shader code
			const fullShaderCode = this.wrapShaderCode(shaderCode, glslRenderer.isWebGL2);

			// Load shader
			const loadResult = glslRenderer.load(fullShaderCode);
			if (!loadResult.success) {
				this.showError(container, loadResult.error || 'Shader compilation failed!');
				return;
			}

			// Load textures if specified
			await this.loadTextures(glslRenderer, config);

			// Set up controls
			this.setupControls(container, glslRenderer, config);

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
			this.showError(container, `Unexpected error: ${errorMessage}`);
		}
	}

	private wrapShaderCode(shaderCode: string, isWebGL2: boolean): string {
		if (isWebGL2) {
			// WebGL2 (GLSL ES 3.00) shader
			const header = `#version 300 es
precision mediump float;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

out vec4 fragColor;

// Shadertoy compatibility macros
#define texture2D texture
#define textureCube texture

`;

			// Footer that calls mainImage function
			const footer = `
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
`;

			return header + shaderCode + footer;
		} else {
			// WebGL1 (GLSL ES 1.00) shader
			const header = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

`;

			// Footer that calls mainImage function
			const footer = `
void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

			return header + shaderCode + footer;
		}
	}

			private setupControls(container: HTMLElement, glslRenderer: GLSLRenderer, config: ShaderConfig) {
		const playButton = container.querySelector('.glsl-viewer-button') as HTMLButtonElement;
		const playOverlay = container.querySelector('.glsl-viewer-play-overlay') as HTMLButtonElement;

		let isPlaying = config.autoplay;

		const updatePlayButton = () => {
			if (playButton) {
				// Always show pause icon, but only display when playing
				playButton.innerHTML = this.getSVGIcon('pause');
				playButton.style.display = isPlaying ? 'block' : 'none';
			}
		};



		if (playButton) {
			// Pause-only button (only pauses, doesn't resume)
			playButton.addEventListener('click', () => {
				if (isPlaying) {
					glslRenderer.pause();
					if (playOverlay) {
						playOverlay.style.display = 'flex';
					}
					isPlaying = false;
					updatePlayButton();
				}
			});
		}

		if (playOverlay) {
			// Play-only overlay (only starts playback)
			playOverlay.addEventListener('click', () => {
				if (!isPlaying) {
					glslRenderer.play();
					playOverlay.style.display = 'none';
					// Switch from placeholder to canvas (only if placeholder is visible)
					const canvas = container.querySelector('.glsl-viewer-canvas') as HTMLCanvasElement;
					const placeholder = container.querySelector('.glsl-viewer-placeholder') as HTMLElement;
					if (placeholder && placeholder.style.display !== 'none') {
						placeholder.style.display = 'none';
						if (canvas) canvas.style.display = 'block';
					}
					isPlaying = true;
					updatePlayButton();
				}
			});
			playOverlay.style.display = config.autoplay ? 'none' : 'flex';
		}

		updatePlayButton();
	}

		private showError(container: HTMLElement, message: string) {
		const canvas = container.querySelector('canvas') as HTMLCanvasElement;
		if (!canvas) return;

		// Remove any existing error display
		const existingError = container.querySelector('.glsl-viewer-error');
		if (existingError) {
			existingError.remove();
		}

		// Create error overlay that covers the entire canvas area
		const errorDiv = document.createElement('div');
		errorDiv.className = 'glsl-viewer-error';

		// Style: full canvas coverage with red background
		errorDiv.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: #cc0000;
			color: white;
			font-family: monospace;
			font-size: 12px;
			padding: 20px;
			box-sizing: border-box;
			word-wrap: break-word;
			overflow-y: auto;
			z-index: 1000;
		`;

		// Add error title
		const titleDiv = document.createElement('div');
		titleDiv.textContent = 'GLSL Compilation Error';
		titleDiv.style.cssText = `
			font-weight: bold;
			font-size: 14px;
			margin-bottom: 10px;
			text-align: left;
		`;
		errorDiv.appendChild(titleDiv);

		// Add error message (clean up control characters but preserve newlines)
		const messageDiv = document.createElement('div');
		const cleanMessage = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
		messageDiv.textContent = cleanMessage;
		messageDiv.style.cssText = `
			text-align: left;
			line-height: 1.4;
			max-width: 100%;
			white-space: pre-wrap;
		`;
		errorDiv.appendChild(messageDiv);

		// Make container position relative to enable absolute positioning of error
		container.style.position = 'relative';

		// Add error div to container
		container.appendChild(errorDiv);
	}
}

class GLSLViewerSettingTab extends PluginSettingTab {
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
		textureInfo.innerHTML = `
			<p>Textures automatically loaded when not specified in shader comments. Leave empty to disable.</p>
			<p><strong>Supported:</strong> Vault-relative paths only</p>
			<p><strong>Note:</strong> Changes apply to new shaders only.</p>
		`;

		// Helper function to create texture setting
		const createTextureSetting = (channelName: string, channelIndex: number, defaultValue: string) => {
			const setting = new Setting(containerEl)
				.setName(`iChannel${channelIndex} Default`)
				.setDesc(`Default texture for iChannel${channelIndex}. ${defaultValue ? `Currently set: ${defaultValue.length > 40 ? defaultValue.substring(0, 40) + '...' : defaultValue}` : 'Not set'}`)
				.addText(text => text
					.setPlaceholder('path/to/texture.png')
					.setValue(defaultValue)
					.onChange(async (value) => {
						(this.plugin.settings as any)[channelName] = value;
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
						(this.plugin.settings as any)[channelName] = '';
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