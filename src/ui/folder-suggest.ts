import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export interface FolderItem {
	folder: TFolder;
	path: string;
}

export class FolderSuggest extends AbstractInputSuggest<FolderItem> {
	private onChoose: (folderPath: string) => void;

	constructor(app: App, inputEl: HTMLInputElement, onChoose: (folderPath: string) => void) {
		super(app, inputEl);
		this.onChoose = onChoose;
		this.limit = 0; // allow showing all folders when needed
	}

	protected getSuggestions(query: string): FolderItem[] {
		const lowerQuery = query.toLowerCase();

		const folders = this.app.vault.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => ({
				folder,
				path: folder.path === '/' ? '' : folder.path
			}))
			.sort((a, b) => a.path.localeCompare(b.path));

		if (!lowerQuery.length) {
			return folders;
		}

		return folders.filter(item => {
			if (!item.path && 'root'.includes(lowerQuery)) {
				return true;
			}
			return item.path.toLowerCase().includes(lowerQuery);
		});
	}

	public renderSuggestion(item: FolderItem, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'glsl-viewer-folder-suggestion' });

		const iconContainer = container.createDiv({ cls: 'glsl-viewer-folder-icon' });
		iconContainer.setText('📁');

		const infoContainer = container.createDiv({ cls: 'glsl-viewer-folder-info' });
		const folderName = infoContainer.createDiv({ cls: 'glsl-viewer-folder-name' });
		folderName.textContent = item.path || 'Root';

		const subfolderCount = item.folder.children.filter(child => 'children' in child).length;
		const fileCount = item.folder.children.filter(child => !('children' in child)).length;

		if (subfolderCount > 0 || fileCount > 0) {
			const stats = infoContainer.createDiv({ cls: 'glsl-viewer-folder-stats' });
			const parts: string[] = [];
			if (subfolderCount > 0) parts.push(`${subfolderCount} folder${subfolderCount > 1 ? 's' : ''}`);
			if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
			stats.textContent = parts.join(', ');
		}
	}

	public selectSuggestion(item: FolderItem, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item.path);
		this.close();
	}
}





