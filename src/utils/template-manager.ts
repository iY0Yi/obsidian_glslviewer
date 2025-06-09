import { App } from 'obsidian';

export class TemplateManager {
	private app: App;
	private templatesDir: string;

	constructor(app: App) {
		this.app = app;
		// Use Vault#configDir instead of hardcoded .obsidian
		this.templatesDir = `${this.app.vault.configDir}/plugins/glsl-viewer/templates`;
	}

		/**
	 * Ensure templates directory exists
	 */
	async ensureTemplatesDir(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;

			// Check if templates directory exists
			const dirExists = await adapter.exists(this.templatesDir);
			if (!dirExists) {
				// Create directories step by step
				const dirs = this.templatesDir.split('/').filter(d => d.length > 0);
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
			const templatePath = `${this.templatesDir}/${templateName}`;

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
			const templatePath = `${this.templatesDir}/${templateName}`;
			return await adapter.exists(templatePath);
		} catch (error) {
			return false;
		}
	}
}