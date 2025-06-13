import { App } from 'obsidian';
import { TextureManager } from './texture-manager';
import { ShaderCompiler } from './shader-compiler';

// Interface to avoid circular dependency with plugin
export interface RendererPlugin {
	activeViewers: Set<GLSLRenderer>;
}

export class GLSLRenderer {
	private canvas: HTMLCanvasElement | null;
	private gl: WebGLRenderingContext | null;
	private program: WebGLProgram | null = null;
	private animationId: number | null = null;
	// フレームベースの時間管理
	private currentTime: number = 0.0;
	private readonly targetFPS: number = 60;
	private readonly frameDelta: number = 1.0 / 60; // 1/60秒
	private frameCount: number = 0;
	private uniforms: { [key: string]: WebGLUniformLocation } = {};
	private textureManager: TextureManager | null;
	private shaderCompiler: ShaderCompiler | null;
	private app: App | null;
	public isWebGL2: boolean;
	private plugin: RendererPlugin | null; // Reference to plugin for cleanup
	private isDestroyed: boolean = false; // Track if destroy has been called

	// Mouse tracking (Shadertoy compatible)
	private mousePosX: number = 0;
	private mousePosY: number = 0;
	private mouseOriX: number = 0;
	private mouseOriY: number = 0;
	private mouseIsDown: boolean = false;

	// Store event listeners and observers for cleanup
	private eventListeners: Array<{element: Element, event: string, handler: EventListener}> = [];
	private domObserver: MutationObserver | null = null;

	constructor(canvas: HTMLCanvasElement, app: App, plugin: RendererPlugin) {
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

		// Initialize managers
		this.textureManager = new TextureManager(this.gl, this.app);
		this.shaderCompiler = new ShaderCompiler(this.gl, this.isWebGL2);

		// Set up mouse tracking
		this.setupMouseTracking();

		// Set up automatic cleanup when canvas is removed from DOM
		this.setupDOMObserver();
	}

	/**
	 * Add event listener and track it for cleanup
	 */
	private addTrackedEventListener(element: Element, event: string, handler: EventListener) {
		element.addEventListener(event, handler);
		this.eventListeners.push({element, event, handler});
	}

	private setupMouseTracking() {
		if (!this.canvas) return;

		const calcMouseX = (ev: MouseEvent): number => {
			if (!this.canvas) return 0;
			const rect = this.canvas.getBoundingClientRect();
			return Math.floor(((ev.clientX - rect.left) / (rect.right - rect.left)) * this.canvas.width);
		};

		const calcMouseY = (ev: MouseEvent): number => {
			if (!this.canvas) return 0;
			const rect = this.canvas.getBoundingClientRect();
			return Math.floor(this.canvas.height - ((ev.clientY - rect.top) / (rect.bottom - rect.top)) * this.canvas.height);
		};

		const onCanvas = (ev: MouseEvent): boolean => {
			if (!this.canvas) return false;
			const rect = this.canvas.getBoundingClientRect();
			return ev.clientX >= rect.left && ev.clientX <= rect.right &&
			       ev.clientY >= rect.top && ev.clientY <= rect.bottom;
		};

		// Use tracked event listeners for proper cleanup
		this.addTrackedEventListener(this.canvas, 'mousedown', (ev: Event) => {
			const mouseEvent = ev as MouseEvent;
			if (mouseEvent.button === 2 || !onCanvas(mouseEvent)) return; // Skip right click or outside canvas

			this.mouseIsDown = true;
			this.mouseOriX = calcMouseX(mouseEvent);
			this.mouseOriY = calcMouseY(mouseEvent);
			this.mousePosX = this.mouseOriX;
			this.mousePosY = this.mouseOriY;
		});

		this.addTrackedEventListener(this.canvas, 'mouseup', (ev: Event) => {
			const mouseEvent = ev as MouseEvent;
			if (!onCanvas(mouseEvent)) return;

			this.mouseIsDown = false;
			// Make click origin negative when released (Shadertoy behavior)
			this.mouseOriX = Math.abs(this.mouseOriX) * -1;
			this.mouseOriY = Math.abs(this.mouseOriY) * -1;
		});

		this.addTrackedEventListener(this.canvas, 'mousemove', (ev: Event) => {
			const mouseEvent = ev as MouseEvent;
			if (!onCanvas(mouseEvent)) return;

			if (this.mouseIsDown) {
				// Update position during drag
				this.mousePosX = calcMouseX(mouseEvent);
				this.mousePosY = calcMouseY(mouseEvent);
				// Keep origin positive during drag
				this.mouseOriX = Math.abs(this.mouseOriX);
				this.mouseOriY = Math.abs(this.mouseOriY);
			}
		});

		this.addTrackedEventListener(this.canvas, 'mouseleave', () => {
			if (this.mouseIsDown) {
				this.mouseIsDown = false;
				this.mouseOriX = Math.abs(this.mouseOriX) * -1;
				this.mouseOriY = Math.abs(this.mouseOriY) * -1;
			}
		});
	}

	private setupDOMObserver() {
		if (!this.canvas) return;

		// Use MutationObserver to detect when canvas is removed from DOM
		this.domObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.removedNodes.forEach((node) => {
					if (node === this.canvas || (node as Element).contains?.(this.canvas)) {
						// Canvas was removed from DOM, clean up
						this.destroy();
					}
				});
			});
		});

		// Observe the parent container for child removals
		if (this.canvas.parentNode) {
			this.domObserver.observe(this.canvas.parentNode, { childList: true, subtree: true });
		}
	}

	load(fragmentShader: string): { success: boolean; error?: string } {
		const result = this.shaderCompiler.compileProgram(fragmentShader);
		if (!result.success) {
			return { success: false, error: result.error };
		}

		this.program = result.program!;
		this.setupUniforms();
		this.setupGeometry();
		return { success: true };
	}

	private setupUniforms() {
		if (!this.program || !this.gl) return;

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
		this.uniforms.iChannel3 = gl.getUniformLocation(this.program, 'iChannel3')!;

		// Texture resolution uniforms
		this.uniforms.iChannelResolution = gl.getUniformLocation(this.program, 'iChannelResolution')!;
	}

	private setupGeometry() {
		if (!this.program || !this.gl) return;

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

		// 初回再生時のみ時間をリセット
		if (this.frameCount === 0) {
			this.currentTime = 0.0;
		}
		// 一時停止からの再開時は何もしない（時間は続きから）

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
		if (!this.program || !this.gl) return;

		const gl = this.gl;
		gl.useProgram(this.program);

		// Set viewport
		if (!this.canvas) return;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);

		// フレームベースの時間更新
		this.currentTime += this.frameDelta;
		this.frameCount++;

		// Shadertoy standard uniforms
		gl.uniform3f(this.uniforms.iResolution, this.canvas.width, this.canvas.height, 1.0);
		gl.uniform1f(this.uniforms.iTime, this.currentTime);
		gl.uniform1f(this.uniforms.iTimeDelta, this.frameDelta);
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
		if (this.textureManager) {
			this.textureManager.bindTextures(this.uniforms);
		}

		// Set texture resolutions
		this.updateTextureResolutions();

		// Draw
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	async loadTexture(channelIndex: number, imagePath: string): Promise<boolean> {
		if (!this.textureManager) return false;
		return this.textureManager.loadTexture(channelIndex, imagePath);
	}

	private updateTextureResolutions() {
		if (!this.program || !this.uniforms.iChannelResolution || !this.gl || !this.textureManager) return;

		// Create array for all channel resolutions [iChannel0, iChannel1, iChannel2, iChannel3]
		const resolutions: number[] = [];
		for (let i = 0; i < 4; i++) {
			const resolution = this.textureManager.getTextureResolution(`iChannel${i}`);
			resolutions.push(resolution[0], resolution[1], resolution[2]); // width, height, depth
		}

		// Send as vec3 array to shader
		this.gl.uniform3fv(this.uniforms.iChannelResolution, resolutions);
	}

	/**
	 * Capture current frame as JPEG image
	 * @param quality JPEG quality (0.0 to 1.0)
	 * @returns Promise that resolves to JPEG blob
	 */
	async captureFrame(quality: number = 0.8): Promise<Blob | null> {
		if (!this.program || !this.canvas) {
			return null;
		}

		try {
			// Ensure we have a fresh render
			this.render();

			// Convert canvas to blob
			return new Promise<Blob | null>((resolve) => {
				if (!this.canvas) {
					resolve(null);
					return;
				}
				this.canvas.toBlob((blob) => {
					resolve(blob);
				}, 'image/jpeg', quality);
			});
		} catch (error) {
			return null;
		}
	}

		/**
	 * Capture frame at a specific time without waiting
	 * @param timeSeconds Time value for iTime uniform (default: 1.0 second)
	 * @param quality JPEG quality (0.0 to 1.0)
	 * @returns Promise that resolves to JPEG blob
	 */
	async captureAtTime(timeSeconds: number = 1.0, quality: number = 0.8): Promise<Blob | null> {
		if (!this.program || !this.canvas) {
			return null;
		}

		try {
			// Render one frame with the specified time
			this.renderAtTime(timeSeconds);

			// Convert canvas to blob
			return new Promise<Blob | null>((resolve) => {
				if (!this.canvas) {
					resolve(null);
					return;
				}
				this.canvas.toBlob((blob) => {
					resolve(blob);
				}, 'image/jpeg', quality);
			});
		} catch (error) {
			return null;
		}
	}

	/**
	 * Render a single frame with a specific time value
	 * @param timeSeconds Time value for iTime uniform
	 */
	private renderAtTime(timeSeconds: number) {
		if (!this.program || !this.gl || !this.canvas) return;

		const gl = this.gl;
		gl.useProgram(this.program);

		// Set viewport
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);

		// Update uniforms with specified time
		gl.uniform3f(this.uniforms.iResolution, this.canvas.width, this.canvas.height, 1.0);
		gl.uniform1f(this.uniforms.iTime, timeSeconds);
		gl.uniform1f(this.uniforms.iTimeDelta, 0.016); // Assume ~60fps
		gl.uniform1i(this.uniforms.iFrame, Math.floor(timeSeconds * 60)); // Approximate frame count

		// Mouse position (use current values)
		gl.uniform4f(this.uniforms.iMouse, this.mousePosX, this.mousePosY, this.mouseOriX, this.mouseOriY);

		// Date uniform (use current date)
		const now = new Date();
		gl.uniform4f(this.uniforms.iDate,
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
		);

		// Bind textures
		if (this.textureManager) {
			this.textureManager.bindTextures(this.uniforms);
		}

		// Set texture resolutions
		this.updateTextureResolutions();

		// Draw
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	/**
	 * Get the canvas element for this renderer
	 */
	getCanvas(): HTMLCanvasElement {
		if (!this.canvas) {
			throw new Error('Canvas is not available (renderer destroyed)');
		}
		return this.canvas;
	}

	destroy() {
		if (this.isDestroyed) return; // Prevent multiple calls
		this.isDestroyed = true;

		// Stop animation first
		this.pause();

		// Remove all tracked event listeners
		this.eventListeners.forEach(({element, event, handler}) => {
			element.removeEventListener(event, handler);
		});
		this.eventListeners = [];

		// Disconnect DOM observer
		if (this.domObserver) {
			this.domObserver.disconnect();
			this.domObserver = null;
		}

		// Clean up WebGL resources
		if (this.textureManager) {
			this.textureManager.destroy();
		}

		if (this.program && this.gl) {
			this.gl.deleteProgram(this.program);
			this.program = null;
		}

		// Clear uniforms references
		this.uniforms = {};

		// Remove from active viewers list (check if plugin still exists)
		if (this.plugin && this.plugin.activeViewers) {
			this.plugin.activeViewers.delete(this);
		}

		// Clear references to help with garbage collection (now type-safe)
		this.canvas = null;
		this.gl = null;
		this.textureManager = null;
		this.shaderCompiler = null;
		this.app = null;
		this.plugin = null;
	}
}