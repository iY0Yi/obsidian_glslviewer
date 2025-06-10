import { App } from 'obsidian';

export class TextureManager {
	private gl: WebGLRenderingContext;
	private app: App;
	private textures: { [key: string]: WebGLTexture } = {};
	private textureResolutions: { [key: string]: [number, number, number] } = {};

	constructor(gl: WebGLRenderingContext, app: App) {
		this.gl = gl;
		this.app = app;
	}

	async loadTexture(channelIndex: number, imagePath: string): Promise<boolean> {
		return new Promise(async (resolve) => {
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
				// Failed to resolve vault path, use original
			}

			img.onload = () => {
				const texture = this.gl.createTexture();
				if (!texture) {
					resolve(false);
					return;
				}

				this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

				// Flip texture vertically to match standard image coordinates
				this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
				this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);

				// Set texture parameters with repeat wrapping
				this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
				this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
				this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
				this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

				const channelName = `iChannel${channelIndex}`;
				this.textures[channelName] = texture;

				// Store texture resolution (width, height, depth)
				// For 2D textures, depth is always 1.0 (3D textures would have actual depth)
				this.textureResolutions[channelName] = [img.width, img.height, 1.0];

				resolve(true);
			};

			img.onerror = () => {
				resolve(false);
			};

			img.src = resolvedPath;
		});
	}

	bindTextures(uniforms: { [key: string]: WebGLUniformLocation }) {
		// Bind textures
		for (let i = 0; i < 4; i++) {
			const channelName = `iChannel${i}`;
			if (this.textures[channelName]) {
				this.gl.activeTexture(this.gl.TEXTURE0 + i);
				this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[channelName]);
				this.gl.uniform1i(uniforms[channelName], i);
			}
		}
	}

	getTexture(channelName: string): WebGLTexture | undefined {
		return this.textures[channelName];
	}

	hasTexture(channelName: string): boolean {
		return channelName in this.textures;
	}

	getAllTextures(): { [key: string]: WebGLTexture } {
		return { ...this.textures };
	}

	getTextureResolution(channelName: string): [number, number, number] {
		return this.textureResolutions[channelName] || [0, 0, 0];
	}

	getAllTextureResolutions(): { [key: string]: [number, number, number] } {
		return { ...this.textureResolutions };
	}

	destroy() {
		// Clean up all textures
		Object.values(this.textures).forEach(texture => {
			this.gl.deleteTexture(texture);
		});
		this.textures = {};
		this.textureResolutions = {};
	}
}