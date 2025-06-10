import { App, FuzzySuggestModal, TFile, FuzzyMatch } from 'obsidian';

export interface ImageFile {
	file: TFile;
	path: string;
}

export class ImageFileSuggestModal extends FuzzySuggestModal<ImageFile> {
	private onChoose: (imagePath: string) => void;
	private textureFolder: string;

	constructor(app: App, onChoose: (imagePath: string) => void, textureFolder: string = '') {
		super(app);
		this.onChoose = onChoose;
		this.textureFolder = textureFolder;

		if (textureFolder) {
			this.setPlaceholder(`Search for image files in ${textureFolder}...`);
		} else {
			this.setPlaceholder('Search for image files...');
		}
	}

	getItems(): ImageFile[] {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];

		let files = this.app.vault.getFiles()
			.filter(file => {
				const extension = file.extension.toLowerCase();
				return imageExtensions.includes('.' + extension);
			});

		// Filter by texture folder if specified
		if (this.textureFolder) {
			const normalizedFolder = this.textureFolder.endsWith('/')
				? this.textureFolder
				: this.textureFolder + '/';

			files = files.filter(file =>
				file.path.startsWith(normalizedFolder) ||
				file.path.startsWith(this.textureFolder + '/')
			);
		}

		return files
			.map(file => ({
				file,
				path: file.path
			}))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: ImageFile): string {
		return item.path;
	}

	onChooseItem(item: ImageFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item.path);
		this.close();
	}

	renderSuggestion(item: FuzzyMatch<ImageFile>, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'image-file-suggestion' });

		// Create thumbnail container
		const thumbnailContainer = container.createDiv({ cls: 'image-file-thumbnail' });
		const thumbnail = thumbnailContainer.createEl('img', { cls: 'image-thumbnail' });

		// Set up thumbnail
		this.loadThumbnail(item.item.file, thumbnail);

		// File info container
		const infoContainer = container.createDiv({ cls: 'image-file-info' });

		// File name (highlighted)
		const fileName = infoContainer.createDiv({ cls: 'image-file-name' });
		fileName.textContent = item.item.file.name;

		// Full path (subdued) - show relative to texture folder if applicable
		let displayPath = item.item.path;
		if (this.textureFolder && item.item.path.startsWith(this.textureFolder)) {
			displayPath = item.item.path.substring(this.textureFolder.length + 1);
		}

		if (displayPath !== item.item.file.name) {
			const filePath = infoContainer.createDiv({ cls: 'image-file-path' });
			filePath.textContent = displayPath;
		}

		// File size info if available
		this.app.vault.adapter.stat(item.item.path).then(statResult => {
			if (statResult && statResult.size) {
				const sizeInfo = infoContainer.createDiv({ cls: 'image-file-size' });
				sizeInfo.textContent = this.formatFileSize(statResult.size);
			}
		}).catch(() => {
			// Silent fail - size info is optional
		});
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
				// Show placeholder on error
				imgElement.style.display = 'none';
				const placeholder = imgElement.parentElement?.createDiv({ cls: 'image-thumbnail-placeholder' });
				if (placeholder) {
					placeholder.textContent = '🖼️';
				}
			};
		} catch (error) {
			// Show placeholder on error
			imgElement.style.display = 'none';
			const placeholder = imgElement.parentElement?.createDiv({ cls: 'image-thumbnail-placeholder' });
			if (placeholder) {
				placeholder.textContent = '🖼️';
			}
		}
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}
}