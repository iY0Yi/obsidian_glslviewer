import { App, FuzzySuggestModal, TFolder, FuzzyMatch } from 'obsidian';

export interface FolderItem {
	folder: TFolder;
	path: string;
}

export class FolderSuggestModal extends FuzzySuggestModal<FolderItem> {
	private onChoose: (folderPath: string) => void;

	constructor(app: App, onChoose: (folderPath: string) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Search for folders...');
	}

	getItems(): FolderItem[] {
		return this.app.vault.getAllLoadedFiles()
			.filter(file => file instanceof TFolder)
			.map(folder => ({
				folder: folder as TFolder,
				path: folder.path === '/' ? '' : folder.path
			}))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: FolderItem): string {
		return item.path || 'Root';
	}

	onChooseItem(item: FolderItem, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item.path);
		this.close();
	}

	renderSuggestion(item: FuzzyMatch<FolderItem>, el: HTMLElement): void {
		const container = el.createDiv({ cls: 'folder-suggestion' });

		// Folder icon
		const iconContainer = container.createDiv({ cls: 'folder-icon' });
		iconContainer.textContent = '📁';

		// Folder info
		const infoContainer = container.createDiv({ cls: 'folder-info' });

		// Folder name/path
		const folderName = infoContainer.createDiv({ cls: 'folder-name' });
		folderName.textContent = item.item.path || 'Root';

		// Subfolder count
		const subfolderCount = item.item.folder.children.filter(child => child instanceof TFolder).length;
		const fileCount = item.item.folder.children.filter(child => !(child instanceof TFolder)).length;

		if (subfolderCount > 0 || fileCount > 0) {
			const folderStats = infoContainer.createDiv({ cls: 'folder-stats' });
			const parts: string[] = [];
			if (subfolderCount > 0) parts.push(`${subfolderCount} folder${subfolderCount > 1 ? 's' : ''}`);
			if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
			folderStats.textContent = parts.join(', ');
		}
	}
}