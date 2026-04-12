import { App, Component } from 'obsidian';
import { TextureManager } from './texture-manager';
import { ShaderCompiler } from './shader-compiler';
import { CustomUniform } from '../types/shader-config';

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

export class GLSLRenderer extends Component {
	private canvas: HTMLCanvasElement | null;
	private gl: WebGLRenderingContext | null;
	private program: WebGLProgram | null = null;
	private animationId: number | null = null;
	// フレームベースの時間管理
	private currentTime: number = 0.0;
	private readonly targetFPS: number = 60;
	private readonly frameDelta: number = 1.0 / 60; // 1/60秒
	private frameCount: number = 0;
	private uniforms: Partial<Record<string, WebGLUniformLocation>> = {};
	private customUniformDefinitions: CustomUniform[] = [];
	private customUniformValues: Record<string, number | [number, number, number]> = {};
	private textureManager: TextureManager | null;
	private shaderCompiler: ShaderCompiler | null;
	private app: App | null;
	public isWebGL2: boolean;
	private isDestroyed: boolean = false; // Track if onunload has been called
	private contextLost: boolean = false;
	private onContextLostCallback: (() => void) | null = null;

	// Mouse tracking (Shadertoy compatible)
	private mousePosX: number = 0;
	private mousePosY: number = 0;
	private mouseOriX: number = 0;
	private mouseOriY: number = 0;
	private mouseIsDown: boolean = false;

	constructor(canvas: HTMLCanvasElement, app: App) {
		super();
		this.canvas = canvas;
		this.app = app;

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

		// Handle WebGL context loss (prevents app crash on mobile GPU timeout)
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault(); // Prevent default to allow possible restore
			this.contextLost = true;
			this.pause();
			if (this.onContextLostCallback) {
				this.onContextLostCallback();
			}
		});
		canvas.addEventListener('webglcontextrestored', () => {
			// Context is restored but all resources are invalidated.
			// Mark as lost so the viewer shows an error rather than rendering garbage.
			this.contextLost = true;
		});

		// Initialize managers
		this.textureManager = new TextureManager(gl, this.app);
		this.shaderCompiler = new ShaderCompiler(gl, this.isWebGL2);
	}

	/**
	 * Called when the component is loaded via addChild() + load().
	 * Set up mouse tracking here since registerDomEvent only works after load.
	 */
	onload() {
		this.setupMouseTracking();
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

		// Use Component's registerDomEvent for automatic cleanup when unloaded
		this.registerDomEvent(this.canvas, 'mousedown', (mouseEvent) => {
			if (mouseEvent.button === 2 || !onCanvas(mouseEvent)) return; // Skip right click or outside canvas

			this.mouseIsDown = true;
			this.mouseOriX = calcMouseX(mouseEvent);
			this.mouseOriY = calcMouseY(mouseEvent);
			this.mousePosX = this.mouseOriX;
			this.mousePosY = this.mouseOriY;
		});

		this.registerDomEvent(this.canvas, 'mouseup', (mouseEvent) => {
			if (!onCanvas(mouseEvent)) return;

			this.mouseIsDown = false;
			// Make click origin negative when released (Shadertoy behavior)
			this.mouseOriX = Math.abs(this.mouseOriX) * -1;
			this.mouseOriY = Math.abs(this.mouseOriY) * -1;
		});

		this.registerDomEvent(this.canvas, 'mousemove', (mouseEvent) => {
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

		this.registerDomEvent(this.canvas, 'mouseleave', () => {
			if (this.mouseIsDown) {
				this.mouseIsDown = false;
				this.mouseOriX = Math.abs(this.mouseOriX) * -1;
				this.mouseOriY = Math.abs(this.mouseOriY) * -1;
			}
		});
	}

	loadShader(fragmentShader: string): { success: boolean; error?: string } {
		if (!this.shaderCompiler || !this.gl) {
			return { success: false, error: 'Renderer not initialized' };
		}

		// Check if the WebGL context is already lost before attempting compilation.
		// This is distinct from the runtime 'webglcontextlost' event handler —
		// it catches cases where the context was destroyed beforehand
		// (e.g., a previous shader's GPU timeout on another viewer in the same page).
		if (this.gl.isContextLost()) {
			this.contextLost = true;
			return { success: false, error: 'WebGL context is already lost. Another shader may have caused a GPU crash.' };
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

		// Custom uniforms
		for (const customUniform of this.customUniformDefinitions) {
			const location = gl.getUniformLocation(program, customUniform.name);
			if (location !== null) {
				this.uniforms[customUniform.name] = location;
			}
		}
	}

	setCustomUniformDefinitions(definitions?: CustomUniform[]): void {
		const isColorValue = (value: unknown): value is [number, number, number] =>
			Array.isArray(value) &&
			value.length >= 3 &&
			typeof value[0] === 'number' &&
			typeof value[1] === 'number' &&
			typeof value[2] === 'number' &&
			Number.isFinite(value[0]) &&
			Number.isFinite(value[1]) &&
			Number.isFinite(value[2]);

		this.customUniformDefinitions = (definitions ?? []).map((definition) => ({ ...definition }));
		const nextValues: Record<string, number | [number, number, number]> = {};
		for (const definition of this.customUniformDefinitions) {
			const existingValue = this.customUniformValues[definition.name];
			if (typeof existingValue === 'number' && Number.isFinite(existingValue)) {
				nextValues[definition.name] = existingValue;
			} else if (isColorValue(existingValue)) {
				nextValues[definition.name] = [existingValue[0], existingValue[1], existingValue[2]];
			} else if (typeof definition.value === 'number' && Number.isFinite(definition.value)) {
				nextValues[definition.name] = definition.value;
			} else if (isColorValue(definition.value)) {
				nextValues[definition.name] = [definition.value[0], definition.value[1], definition.value[2]];
			} else {
				nextValues[definition.name] = 0;
			}
		}
		this.customUniformValues = nextValues;
	}

	setCustomUniformValue(name: string, value: number | [number, number, number]): void {
		if (typeof value === 'number') {
			if (!Number.isFinite(value)) {
				return;
			}
			this.customUniformValues[name] = value;
		} else if (Array.isArray(value) && value.length >= 3) {
			const colorValue: [number, number, number] = [value[0], value[1], value[2]];
			if (!colorValue.every((channel) => Number.isFinite(channel))) {
				return;
			}
			this.customUniformValues[name] = colorValue;
		} else {
			return;
		}

		if (!this.animationId) {
			this.renderAtTime(this.currentTime);
		}
	}

	private applyCustomUniforms() {
		if (!this.gl) {
			return;
		}

		for (const customUniform of this.customUniformDefinitions) {
			const location = this.uniforms[customUniform.name];
			if (location === undefined) {
				continue;
			}

			const value = this.customUniformValues[customUniform.name];
			switch (customUniform.type) {
				case 'color': {
					const fallbackColor = customUniform.value;
					const color = Array.isArray(value) ? value : fallbackColor;
					this.gl.uniform3f(location, color[0], color[1], color[2]);
					break;
				}
				default: {
					const scalar = typeof value === 'number' ? value : customUniform.value;
					this.gl.uniform1f(location, scalar);
					break;
				}
			}
		}
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
			-1, 1,
			1, 1,
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
		if (this.contextLost) {
			this.pause();
			return;
		}
		this.render();
		this.animationId = requestAnimationFrame(this.animate);
	}

	private render() {
		if (!this.program || !this.gl || this.contextLost) return;

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
		this.applyCustomUniforms();

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
		this.applyCustomUniforms();

		// Draw
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	/**
	 * Register a callback for when WebGL context is lost (e.g., GPU timeout on mobile)
	 */
	onContextLost(callback: () => void): void {
		this.onContextLostCallback = callback;
	}

	/**
	 * Check if the WebGL context has been lost
	 */
	getContextLost(): boolean {
		return this.contextLost;
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

	onunload() {
		if (this.isDestroyed) return; // Prevent multiple calls
		this.isDestroyed = true;

		// Stop animation first
		this.pause();

		// Event listeners are automatically cleaned up by Component.unload()

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
