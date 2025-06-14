import { App } from 'obsidian';
import { GLSLViewerSettings } from '../types/settings';

export class TemplateManager {
	private app: App;
	private settings: GLSLViewerSettings;

	constructor(app: App, settings: GLSLViewerSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Get the templates directory path based on user settings
	 */
	private getTemplatesDir(): string {
		// If user has set a custom folder, use it (relative to vault root)
		// Otherwise fall back to the old plugin directory for backward compatibility
		if (this.settings.templatesFolder && this.settings.templatesFolder.trim()) {
			return this.settings.templatesFolder;
		}
		return `${this.app.vault.configDir}/plugins/glsl-viewer/templates`;
	}

	/**
	 * Ensure templates directory exists
	 */
	async ensureTemplatesDir(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const templatesDir = this.getTemplatesDir();

			// Check if templates directory exists
			const dirExists = await adapter.exists(templatesDir);
			if (!dirExists) {
				// Create directories step by step
				const dirs = templatesDir.split('/').filter(d => d.length > 0);
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
			// Silent handling - templates are optional
		}
	}

	/**
	 * Load template file and apply user code
	 */
	async loadAndApplyTemplate(templateName: string, userCode: string): Promise<string | null> {
		try {
			const adapter = this.app.vault.adapter;
			const templatePath = `${this.getTemplatesDir()}/${templateName}`;

			// Check if template exists
			const exists = await adapter.exists(templatePath);
			if (!exists) {
				return null;
			}

			// Read template content
			const templateContent = await adapter.read(templatePath);

			// Replace placeholder with user code
			const result = templateContent.replace('@TEMPLATE_LINES', userCode);

			return result;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Check if template exists
	 */
	async templateExists(templateName: string): Promise<boolean> {
		try {
			const adapter = this.app.vault.adapter;
			const templatePath = `${this.getTemplatesDir()}/${templateName}`;
			return await adapter.exists(templatePath);
		} catch (error) {
			return false;
		}
	}
}