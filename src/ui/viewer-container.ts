import { ShaderConfig } from '../types/shader-config';
import { getSVGIcon } from '../utils/icons';

export class ViewerContainer {
	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private placeholder: HTMLElement;
	private controls: HTMLElement;
	private playButton: HTMLButtonElement | null = null;
	private playOverlay: HTMLButtonElement | null = null;

	constructor(config: ShaderConfig, parentEl: HTMLElement) {
		this.container = this.createContainer(parentEl);
		this.placeholder = this.createPlaceholder(config);
		this.canvas = this.createCanvas(config);
		this.controls = this.createControls();
		this.createPlayElements(config);
	}

	private createContainer(parentEl: HTMLElement): HTMLElement {
		const container = document.createElement('div');
		container.className = 'glsl-viewer-container';
		container.style.position = 'relative'; // Enable absolute positioning for children
		parentEl.appendChild(container);
		return container;
	}

	private createPlaceholder(config: ShaderConfig): HTMLElement {
		const placeholder = document.createElement('div');
		placeholder.className = 'glsl-viewer-placeholder';
		placeholder.style.width = '100%';
		placeholder.style.aspectRatio = (1 / config.aspect).toString();
		placeholder.style.backgroundColor = '#000';
		placeholder.style.display = config.autoplay ? 'none' : 'block';
		this.container.appendChild(placeholder);
		return placeholder;
	}

	private createCanvas(config: ShaderConfig): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.className = 'glsl-viewer-canvas';

		// Calculate canvas resolution based on aspect ratio
		const baseResolution = 800; // Base width resolution
		canvas.width = baseResolution;
		canvas.height = Math.round(baseResolution * config.aspect);

		canvas.style.width = '100%';
		canvas.style.aspectRatio = (1 / config.aspect).toString();
		canvas.style.display = config.autoplay ? 'block' : 'none'; // Show canvas only when autoplay
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
		this.playButton.className = 'glsl-viewer-button';
		this.playButton.innerHTML = getSVGIcon('pause');
		this.playButton.style.display = config.autoplay ? 'block' : 'none'; // Only show when playing
		this.controls.appendChild(this.playButton);

		// Create play overlay (shown initially if not autoplay)
		if (!config.autoplay) {
			this.playOverlay = document.createElement('button');
			this.playOverlay.className = 'glsl-viewer-play-overlay';
			this.playOverlay.innerHTML = getSVGIcon('play');
			this.container.appendChild(this.playOverlay);
		}
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
		this.canvas.style.display = 'block';
	}

	hideCanvas() {
		this.canvas.style.display = 'none';
	}

	showPlaceholder() {
		this.placeholder.style.display = 'block';
	}

	hidePlaceholder() {
		this.placeholder.style.display = 'none';
	}

	showPlayOverlay() {
		if (this.playOverlay) {
			this.playOverlay.style.display = 'flex';
		}
	}

	hidePlayOverlay() {
		if (this.playOverlay) {
			this.playOverlay.style.display = 'none';
		}
	}

	showPlayButton() {
		if (this.playButton) {
			this.playButton.style.display = 'block';
		}
	}

	hidePlayButton() {
		if (this.playButton) {
			this.playButton.style.display = 'none';
		}
	}

	updatePlayButtonIcon(icon: string) {
		if (this.playButton) {
			this.playButton.innerHTML = getSVGIcon(icon);
		}
	}
}