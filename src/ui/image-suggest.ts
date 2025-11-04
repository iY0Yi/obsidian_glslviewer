import { AbstractInputSuggest, App, TFile } from 'obsidian';

export interface ImageFile {
	file: TFile;
	path: string;
}

type TextureFolderResolver = () => string;
type ImageSelectHandler = (imagePath: string) => void;

export class ImageFileSuggest extends AbstractInputSuggest<ImageFile> {
	private getTextureFolder: TextureFolderResolver;
	private onChoose: ImageSelectHandler;

	constructor(app: App, inputEl: HTMLInputElement, getTextureFolder: TextureFolderResolver, onChoose: ImageSelectHandler) {
		super(app, inputEl);
		this.getTextureFolder = getTextureFolder;
		this.onChoose = onChoose;
		this.limit = 0; // Allow scrolling through all matches
	}

	protected getSuggestions(query: string): ImageFile[] {
		const lowerQuery = query.toLowerCase();
		const textureFolder = this.getTextureFolder();
		const hasFolderFilter = Boolean(textureFolder && textureFolder.trim().length);
		const normalizedFolder = hasFolderFilter
			? (textureFolder.endsWith('/') ? textureFolder : `${textureFolder}/`)
			: '';

		const files = this.app.vault.getFiles()
			.filter(file => this.isImageFile(file))
			.filter(file => !hasFolderFilter || file.path.startsWith(normalizedFolder))
			.map(file => ({ file, path: file.path }))
			.sort((a, b) => a.path.localeCompare(b.path));

		if (!lowerQuery.length) {
			return files;
		}

		return files.filter(item =>
			item.path.toLowerCase().includes(lowerQuery) ||
			item.file.name.toLowerCase().includes(lowerQuery)
		);
	}

	public renderSuggestion(item: ImageFile, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'glsl-viewer-image-suggestion' });

		const thumbnailContainer = container.createDiv({ cls: 'glsl-viewer-image-thumbnail' });
		const thumbnail = thumbnailContainer.createEl('img', { cls: 'glsl-viewer-image-preview' });
		void this.loadThumbnail(item.file, thumbnail);

		const infoContainer = container.createDiv({ cls: 'glsl-viewer-image-info' });
		const fileName = infoContainer.createDiv({ cls: 'glsl-viewer-image-name' });
		fileName.textContent = item.file.name;

		const textureFolder = this.getTextureFolder();
		let displayPath = item.path;
		if (textureFolder && textureFolder.trim().length && displayPath.startsWith(textureFolder + '/')) {
			displayPath = displayPath.substring(textureFolder.length + 1);
		}

		if (displayPath !== item.file.name) {
			const filePath = infoContainer.createDiv({ cls: 'glsl-viewer-image-path' });
			filePath.textContent = displayPath;
		}

		this.app.vault.adapter.stat(item.path).then((statResult) => {
			if (statResult && statResult.size) {
				const sizeInfo = infoContainer.createDiv({ cls: 'glsl-viewer-image-size' });
				sizeInfo.textContent = this.formatFileSize(statResult.size);
			}
		}).catch(() => {
			// Optional info; ignore errors
		});
	}

	public selectSuggestion(item: ImageFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item.path);
		this.close();
	}

	private isImageFile(file: TFile): boolean {
		const extension = `.${file.extension.toLowerCase()}`;
		const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
		return supportedExtensions.includes(extension);
	}

	private async loadThumbnail(file: TFile, imgElement: HTMLImageElement): Promise<void> {
		try {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const blob = new Blob([arrayBuffer]);
			const url = URL.createObjectURL(blob);

			imgElement.src = url;
			imgElement.onload = () => {
				URL.revokeObjectURL(url);
			};
			imgElement.onerror = () => {
				URL.revokeObjectURL(url);
				this.showPlaceholder(imgElement);
			};
		} catch {
			this.showPlaceholder(imgElement);
		}
	}

	private showPlaceholder(imgElement: HTMLImageElement): void {
		imgElement.addClass('glsl-viewer-image-hidden');
		const placeholder = imgElement.parentElement?.createDiv({ cls: 'glsl-viewer-image-placeholder' });
		if (placeholder) {
			placeholder.setText('🖼️');
		}
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}
}





