import { ShaderConfig } from '../types/shader-config';
import { createSVGIconElement } from '../utils/icons';

export class ViewerContainer {
	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private placeholder: HTMLElement;
	private controls: HTMLElement;
	private playButton: HTMLButtonElement | null = null;
	private playOverlay: HTMLButtonElement | null = null;

	constructor(config: ShaderConfig, parentEl: HTMLElement) {
		this.container = this.createContainer(parentEl, config);
		this.placeholder = this.createPlaceholder(config);
		this.canvas = this.createCanvas(config);
		this.controls = this.createControls();
		this.createPlayElements(config);
	}

	private createContainer(parentEl: HTMLElement, config: ShaderConfig): HTMLElement {
		const container = document.createElement('div');
		container.className = 'glsl-viewer-container';
		// CSS変数でアスペクト比を設定
		container.style.setProperty('--aspect-ratio', config.aspect.toString());
		parentEl.appendChild(container);
		return container;
	}

	private createPlaceholder(config: ShaderConfig): HTMLElement {
		const placeholder = document.createElement('div');
		placeholder.className = `glsl-viewer-placeholder${config.autoplay ? '' : ' visible'}`;
		this.container.appendChild(placeholder);
		return placeholder;
	}

	private createCanvas(config: ShaderConfig): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.className = `glsl-viewer-canvas${config.autoplay ? '' : ' hidden'}`;

		// Calculate canvas resolution based on aspect ratio
		const baseResolution = 800; // Base width resolution
		canvas.width = baseResolution;
		canvas.height = Math.round(baseResolution * config.aspect);

		this.container.appendChild(canvas);
		return canvas;
	}

	private createControls(): HTMLElement {
		const controls = document.createElement('div');
		controls.className = 'glsl-viewer-controls';
		this.container.appendChild(controls);
		return controls;
	}

	private createPlayElements(config: ShaderConfig) {
		// Create pause-only button (only shown when playing)
		this.playButton = document.createElement('button');
		this.playButton.className = `glsl-viewer-button${config.autoplay ? ' visible' : ''}`;
		const pauseIcon = createSVGIconElement('pause');
		if (pauseIcon) {
			this.playButton.appendChild(pauseIcon);
		}
		this.controls.appendChild(this.playButton);

		// Create play overlay (always create, but only show initially if not autoplay)
		this.playOverlay = document.createElement('button');
		this.playOverlay.className = `glsl-viewer-play-overlay${config.autoplay ? ' hidden' : ''}`;
		const playIcon = createSVGIconElement('play');
		if (playIcon) {
			this.playOverlay.appendChild(playIcon);
		}
		this.container.appendChild(this.playOverlay);
	}

	// Getters for accessing elements
	getContainer(): HTMLElement {
		return this.container;
	}

	getCanvas(): HTMLCanvasElement {
		return this.canvas;
	}

	getPlaceholder(): HTMLElement {
		return this.placeholder;
	}

	getPlayButton(): HTMLButtonElement | null {
		return this.playButton;
	}

	getPlayOverlay(): HTMLButtonElement | null {
		return this.playOverlay;
	}

	// Utility methods for UI state management
	showCanvas() {
		this.canvas.classList.remove('hidden');
	}

	hideCanvas() {
		this.canvas.classList.add('hidden');
	}

	showPlaceholder() {
		this.placeholder.classList.add('visible');
	}

	hidePlaceholder() {
		this.placeholder.classList.remove('visible');
	}

	showPlayOverlay() {
		if (this.playOverlay) {
			this.playOverlay.classList.remove('hidden');
		}
	}

	hidePlayOverlay() {
		if (this.playOverlay) {
			this.playOverlay.classList.add('hidden');
		}
	}

	showPlayButton() {
		if (this.playButton) {
			this.playButton.classList.add('visible');
		}
	}

	hidePlayButton() {
		if (this.playButton) {
			this.playButton.classList.remove('visible');
		}
	}

	updatePlayButtonIcon(icon: string) {
		if (this.playButton) {
			// Clear existing icon and add new one using DOM API
			this.playButton.textContent = '';
			const iconElement = createSVGIconElement(icon);
			if (iconElement) {
				this.playButton.appendChild(iconElement);
			}
		}
	}

	// Set thumbnail using CSS variables
	setThumbnail(dataUrl: string) {
		this.placeholder.style.setProperty('--thumbnail-image', `url(${dataUrl})`);
		this.placeholder.style.setProperty('--thumbnail-size', 'cover');
		this.placeholder.style.setProperty('--thumbnail-position', 'center');
		this.placeholder.style.setProperty('--thumbnail-repeat', 'no-repeat');
	}
}