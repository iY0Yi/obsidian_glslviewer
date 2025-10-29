import { ShaderConfig } from '../types/shader-config';
import { GLSLIconName, setGLSLIcon } from '../utils/icons';

export class ViewerContainer {
	private container: HTMLElement;
	private canvas: HTMLCanvasElement;
	private placeholder: HTMLElement;
	private controls: HTMLElement;
	private playButton: HTMLButtonElement | null = null;
	private stopButton: HTMLButtonElement | null = null;
	private playOverlay: HTMLButtonElement | null = null;
	private playButtonIcon: HTMLElement | null = null;
	private stopButtonIcon: HTMLElement | null = null;
	private playOverlayIcon: HTMLElement | null = null;

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
		// アスペクト比をdata属性で設定し、CSSで処理
		container.setAttribute('data-aspect-ratio', config.aspect.toString());
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
		const playIconContainer = document.createElement('span');
		playIconContainer.className = 'glsl-viewer-icon';
		setGLSLIcon(playIconContainer, 'pause');
		this.playButton.appendChild(playIconContainer);
		this.playButtonIcon = playIconContainer;
		this.controls.appendChild(this.playButton);

		// Create stop button (only shown when playing)
		this.stopButton = document.createElement('button');
		this.stopButton.className = `glsl-viewer-button${config.autoplay ? ' visible' : ''}`;
		const stopIconContainer = document.createElement('span');
		stopIconContainer.className = 'glsl-viewer-icon';
		setGLSLIcon(stopIconContainer, 'stop');
		this.stopButton.appendChild(stopIconContainer);
		this.stopButtonIcon = stopIconContainer;
		this.controls.appendChild(this.stopButton);

		// Create play overlay (always create, but only show initially if not autoplay)
		this.playOverlay = document.createElement('button');
		this.playOverlay.className = `glsl-viewer-play-overlay${config.autoplay ? ' hidden' : ''}`;
		const overlayIconContainer = document.createElement('span');
		overlayIconContainer.className = 'glsl-viewer-icon';
		setGLSLIcon(overlayIconContainer, 'play');
		this.playOverlay.appendChild(overlayIconContainer);
		this.playOverlayIcon = overlayIconContainer;
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

	getStopButton(): HTMLButtonElement | null {
		return this.stopButton;
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

	showStopButton() {
		if (this.stopButton) {
			this.stopButton.classList.add('visible');
		}
	}

	hideStopButton() {
		if (this.stopButton) {
			this.stopButton.classList.remove('visible');
		}
	}

	updatePlayButtonIcon(icon: GLSLIconName) {
		if (this.playButtonIcon) {
			setGLSLIcon(this.playButtonIcon, icon);
		}
	}

	// Set thumbnail using img element to avoid JavaScript style manipulation
	setThumbnail(dataUrl: string) {
		// Clear any existing content
		this.placeholder.empty();

		// Create img element for thumbnail display (avoids CSS style manipulation)
		const thumbnailImg = this.placeholder.createEl('img', {
			cls: 'glsl-viewer-thumbnail-image'
		});
		thumbnailImg.src = dataUrl;
	}
}


