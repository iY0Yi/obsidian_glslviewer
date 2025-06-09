import { App, TFile, TFolder } from 'obsidian';
import { ShaderConfig } from '../types/shader-config';

export class ThumbnailManager {
	private app: App;
	private thumbnailDir: string = '.obsidian/plugins/glsl-viewer/thumbnails';

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate hash from shader code and config for thumbnail filename
	 */
	private generateHash(shaderCode: string, config?: ShaderConfig): string {
		// Include config that affects rendering in hash generation
		let hashInput = shaderCode;

		if (config) {
			// Include settings that affect thumbnail appearance
			hashInput += `|aspect:${config.aspect}`;
			if (config.iChannel0) hashInput += `|ch0:${config.iChannel0}`;
			if (config.iChannel1) hashInput += `|ch1:${config.iChannel1}`;
			if (config.iChannel2) hashInput += `|ch2:${config.iChannel2}`;
			if (config.iChannel3) hashInput += `|ch3:${config.iChannel3}`;
		}

		// Simple hash function for combined input
		let hash = 0;
		for (let i = 0; i < hashInput.length; i++) {
			const char = hashInput.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(16);
	}

	/**
	 * Get thumbnail file path for given shader code and config
	 */
	private getThumbnailFilePath(shaderCode: string, config?: ShaderConfig): string {
		const hash = this.generateHash(shaderCode, config);
		return `${this.thumbnailDir}/${hash}.jpg`;
	}

				/**
	 * Ensure thumbnail directory exists
	 */
	private async ensureThumbnailDir(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;

			// Check if directory exists using adapter
			const dirExists = await adapter.exists(this.thumbnailDir);
			if (!dirExists) {
				// Create directories step by step (for nested paths)
				const dirs = this.thumbnailDir.split('/').filter(d => d.length > 0);
				let currentPath = '';

				for (const dir of dirs) {
					currentPath = currentPath ? `${currentPath}/${dir}` : dir;
					const exists = await adapter.exists(currentPath);
					if (!exists) {
						await adapter.mkdir(currentPath);
					}
				}
			}
		} catch (error) {
			// If folder creation fails, it might already exist
		}
	}

			/**
	 * Check if thumbnail exists for given shader code and config
	 */
	async thumbnailExists(shaderCode: string, config?: ShaderConfig): Promise<boolean> {
		const thumbnailPath = this.getThumbnailFilePath(shaderCode, config);
		return await this.app.vault.adapter.exists(thumbnailPath);
	}

	/**
	 * Save thumbnail image to vault
	 */
	async saveThumbnail(shaderCode: string, imageBlob: Blob, config?: ShaderConfig): Promise<string | null> {
		try {
			await this.ensureThumbnailDir();

			const thumbnailPath = this.getThumbnailFilePath(shaderCode, config);
			const arrayBuffer = await imageBlob.arrayBuffer();
			const uint8Array = new Uint8Array(arrayBuffer);

			// Use adapter for more reliable file operations
			const adapter = this.app.vault.adapter;

			// Write file directly using adapter
			await adapter.writeBinary(thumbnailPath, uint8Array);

			return thumbnailPath;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Get thumbnail file path if it exists
	 */
	async getThumbnailUrl(shaderCode: string, config?: ShaderConfig): Promise<string | null> {
		const thumbnailPath = this.getThumbnailFilePath(shaderCode, config);
		const exists = await this.thumbnailExists(shaderCode, config);
		return exists ? thumbnailPath : null;
	}

	/**
	 * Get thumbnail as data URL for display
	 */
	async getThumbnailDataUrl(shaderCode: string, config?: ShaderConfig): Promise<string | null> {
		try {
			const thumbnailPath = this.getThumbnailFilePath(shaderCode, config);
			const adapter = this.app.vault.adapter;

			// Check if file exists
			const exists = await adapter.exists(thumbnailPath);
			if (!exists) {
				return null;
			}

			// Read file using adapter
			const arrayBuffer = await adapter.readBinary(thumbnailPath);
			const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });

			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => resolve(null);
				reader.readAsDataURL(blob);
			});
		} catch (error) {
			return null;
		}
	}
}