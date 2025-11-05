import { App } from 'obsidian';
import { TextureManager } from './texture-manager';
import { ShaderCompiler } from './shader-compiler';

export type DomEventRegistrar = <K extends keyof HTMLElementEventMap>(
	element: HTMLElement,
	event: K,
	handler: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
	options?: boolean | AddEventListenerOptions,
) => void;

const isWebGL2Context = (context: unknown): context is WebGL2RenderingContext =>
	typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext;

const isWebGLContext = (context: unknown): context is WebGLRenderingContext =>
	typeof WebGLRenderingContext !== 'undefined' && context instanceof WebGLRenderingContext;

type ShaderUniformName =
	| 'iResolution'
	| 'iTime'
	| 'iTimeDelta'
	| 'iFrame'
	| 'iMouse'
	| 'iDate'
	| 'iChannel0'
	| 'iChannel1'
	| 'iChannel2'
	| 'iChannel3'
	| 'iChannelResolution';

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
	private uniforms: Partial<Record<ShaderUniformName, WebGLUniformLocation>> = {};
	private textureManager: TextureManager | null;
	private shaderCompiler: ShaderCompiler | null;
	private app: App | null;
	public isWebGL2: boolean;
	private isDestroyed: boolean = false; // Track if destroy has been called

	// Mouse tracking (Shadertoy compatible)
	private mousePosX: number = 0;
	private mousePosY: number = 0;
	private mouseOriX: number = 0;
	private mouseOriY: number = 0;
	private mouseIsDown: boolean = false;

	// Store event listeners and observers for cleanup
        private eventListeners: Array<{element: HTMLElement, event: keyof HTMLElementEventMap, handler: EventListener}> = [];
        private domEventRegistrar?: DomEventRegistrar;

        constructor(canvas: HTMLCanvasElement, app: App, domEventRegistrar?: DomEventRegistrar) {
                this.canvas = canvas;
                this.app = app;
                this.domEventRegistrar = domEventRegistrar;

                // Try WebGL2 first, fallback to WebGL1
                const requestedWebGL2 = canvas.getContext('webgl2');
                if (isWebGL2Context(requestedWebGL2)) {
			this.gl = requestedWebGL2;
			this.isWebGL2 = true;
		} else {
			const requestedWebGL = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
			if (!isWebGLContext(requestedWebGL)) {
				throw new Error('WebGL not supported');
			}
			this.gl = requestedWebGL;
			this.isWebGL2 = false;
		}

		const gl = this.gl;
		if (!gl) {
			throw new Error('WebGL context initialization failed');
		}

		// Initialize managers
		this.textureManager = new TextureManager(gl, this.app);
		this.shaderCompiler = new ShaderCompiler(gl, this.isWebGL2);

		// Set up mouse tracking
		this.setupMouseTracking();
	}

	/**
	 * Add event listener and track it for cleanup
	 */
        private addTrackedEventListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, event: K, handler: (ev: HTMLElementEventMap[K]) => void) {
                const wrappedHandler = handler as unknown as EventListener;
                if (this.domEventRegistrar) {
                        this.domEventRegistrar(element, event, handler as (this: HTMLElement, ev: HTMLElementEventMap[K]) => void);
                } else {
                        element.addEventListener(event, wrappedHandler);
                }
                this.eventListeners.push({element, event, handler: wrappedHandler});
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
		this.addTrackedEventListener(this.canvas, 'mousedown', (mouseEvent) => {
			if (mouseEvent.button === 2 || !onCanvas(mouseEvent)) return; // Skip right click or outside canvas

			this.mouseIsDown = true;
			this.mouseOriX = calcMouseX(mouseEvent);
			this.mouseOriY = calcMouseY(mouseEvent);
			this.mousePosX = this.mouseOriX;
			this.mousePosY = this.mouseOriY;
		});

		this.addTrackedEventListener(this.canvas, 'mouseup', (mouseEvent) => {
			if (!onCanvas(mouseEvent)) return;

			this.mouseIsDown = false;
			// Make click origin negative when released (Shadertoy behavior)
			this.mouseOriX = Math.abs(this.mouseOriX) * -1;
			this.mouseOriY = Math.abs(this.mouseOriY) * -1;
		});

		this.addTrackedEventListener(this.canvas, 'mousemove', (mouseEvent) => {
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

	load(fragmentShader: string): { success: boolean; error?: string } {
		if (!this.shaderCompiler) {
			return { success: false, error: 'Renderer not initialized' };
		}

		try {
			const result = this.shaderCompiler.compileProgram(fragmentShader);
			if (!result.success) {
				return result;
			}

			this.program = result.program;
			this.setupUniforms();
			this.setupGeometry();
			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { success: false, error: errorMessage };
		}
	}

	private setupUniforms() {
		if (!this.program || !this.gl) {
			throw new Error('Renderer not initialized');
		}

		const program = this.program;
		const gl = this.gl;
		gl.useProgram(program);

		const assignUniform = (uniformName: ShaderUniformName) => {
			const location = gl.getUniformLocation(program, uniformName);
			if (location) {
				this.uniforms[uniformName] = location;
			}
		};

		// Get uniform locations (Shadertoy standard uniforms)
		assignUniform('iResolution');
		assignUniform('iTime');
		assignUniform('iTimeDelta');
		assignUniform('iFrame');
		assignUniform('iMouse');
		assignUniform('iDate');

		// Texture uniforms
		assignUniform('iChannel0');
		assignUniform('iChannel1');
		assignUniform('iChannel2');
		assignUniform('iChannel3');

		// Texture resolution uniforms
		assignUniform('iChannelResolution');
	}

	private setupGeometry() {
		if (!this.program || !this.gl) {
			throw new Error('Renderer not initialized');
		}

		const program = this.program;
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
		const positionLocation = gl.getAttribLocation(program, 'position');
		if (positionLocation === -1) {
			throw new Error('Required attribute position not found');
		}
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
		const resolutionUniform = this.uniforms.iResolution;
		if (resolutionUniform) {
			gl.uniform3f(resolutionUniform, this.canvas.width, this.canvas.height, 1.0);
		}
		const timeUniform = this.uniforms.iTime;
		if (timeUniform) {
			gl.uniform1f(timeUniform, this.currentTime);
		}
		const timeDeltaUniform = this.uniforms.iTimeDelta;
		if (timeDeltaUniform) {
			gl.uniform1f(timeDeltaUniform, this.frameDelta);
		}
		const frameUniform = this.uniforms.iFrame;
		if (frameUniform) {
			gl.uniform1i(frameUniform, this.frameCount);
		}

		// Mouse position (Shadertoy compatible)
		const mouseUniform = this.uniforms.iMouse;
		if (mouseUniform) {
			gl.uniform4f(mouseUniform, this.mousePosX, this.mousePosY, this.mouseOriX, this.mouseOriY);
		}

		// Date uniform (year, month, day, seconds)
		const dateUniform = this.uniforms.iDate;
		if (dateUniform) {
			const now = new Date();
			gl.uniform4f(dateUniform,
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
				now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
			);
		}

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
		const channelResolutionUniform = this.uniforms.iChannelResolution;
		if (!this.program || !channelResolutionUniform || !this.gl || !this.textureManager) return;

		// Create array for all channel resolutions [iChannel0, iChannel1, iChannel2, iChannel3]
		const resolutions: number[] = [];
		for (let i = 0; i < 4; i++) {
			const resolution = this.textureManager.getTextureResolution(`iChannel${i}`);
			resolutions.push(resolution[0], resolution[1], resolution[2]); // width, height, depth
		}

		// Send as vec3 array to shader
		this.gl.uniform3fv(channelResolutionUniform, resolutions);
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
		} catch {
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
		} catch {
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
		const resolutionUniform = this.uniforms.iResolution;
		if (resolutionUniform) {
			gl.uniform3f(resolutionUniform, this.canvas.width, this.canvas.height, 1.0);
		}
		const timeUniform = this.uniforms.iTime;
		if (timeUniform) {
			gl.uniform1f(timeUniform, timeSeconds);
		}
		const timeDeltaUniform = this.uniforms.iTimeDelta;
		if (timeDeltaUniform) {
			gl.uniform1f(timeDeltaUniform, 0.016); // Assume ~60fps
		}
		const frameUniform = this.uniforms.iFrame;
		if (frameUniform) {
			gl.uniform1i(frameUniform, Math.floor(timeSeconds * 60)); // Approximate frame count
		}

		// Mouse position (use current values)
		const mouseUniform = this.uniforms.iMouse;
		if (mouseUniform) {
			gl.uniform4f(mouseUniform, this.mousePosX, this.mousePosY, this.mouseOriX, this.mouseOriY);
		}

		// Date uniform (use current date)
		const dateUniform = this.uniforms.iDate;
		if (dateUniform) {
			const now = new Date();
			gl.uniform4f(dateUniform,
				now.getFullYear(),
				now.getMonth(),
				now.getDate(),
				now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
			);
		}

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

		// Clear references to help with garbage collection (now type-safe)
		this.canvas = null;
		this.gl = null;
		this.textureManager = null;
		this.shaderCompiler = null;
		this.app = null;
	}
}
