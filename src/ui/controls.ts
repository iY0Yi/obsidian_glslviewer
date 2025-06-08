import { ShaderConfig } from '../types/shader-config';
import { ViewerContainer } from './viewer-container';
import { GLSLRenderer } from '../core/renderer';

export class ControlsManager {
	private viewerContainer: ViewerContainer;
	private glslRenderer: GLSLRenderer;
	private config: ShaderConfig;
	private isPlaying: boolean;

	constructor(viewerContainer: ViewerContainer, glslRenderer: GLSLRenderer, config: ShaderConfig) {
		this.viewerContainer = viewerContainer;
		this.glslRenderer = glslRenderer;
		this.config = config;
		this.isPlaying = config.autoplay;

		this.setupEventListeners();
		this.updatePlayButton();
	}

	private setupEventListeners() {
		const playButton = this.viewerContainer.getPlayButton();
		const playOverlay = this.viewerContainer.getPlayOverlay();

		if (playButton) {
			// Pause-only button (only pauses, doesn't resume)
			playButton.addEventListener('click', () => {
				if (this.isPlaying) {
					this.pause();
				}
			});
		}

		if (playOverlay) {
			// Play-only overlay (only starts playback)
			playOverlay.addEventListener('click', () => {
				if (!this.isPlaying) {
					this.play();
				}
			});

			// Set initial display state
			playOverlay.style.display = this.config.autoplay ? 'none' : 'flex';
		}
	}

	private play() {
		this.glslRenderer.play();
		this.viewerContainer.hidePlayOverlay();

		// Switch from placeholder to canvas (only if placeholder is visible)
		const placeholder = this.viewerContainer.getPlaceholder();
		if (placeholder && placeholder.style.display !== 'none') {
			this.viewerContainer.hidePlaceholder();
			this.viewerContainer.showCanvas();
		}

		this.isPlaying = true;
		this.updatePlayButton();
	}

	private pause() {
		this.glslRenderer.pause();
		this.viewerContainer.showPlayOverlay();
		this.isPlaying = false;
		this.updatePlayButton();
	}

	private updatePlayButton() {
		const playButton = this.viewerContainer.getPlayButton();
		if (playButton) {
			// Always show pause icon, but only display when playing
			this.viewerContainer.updatePlayButtonIcon('pause');
			if (this.isPlaying) {
				this.viewerContainer.showPlayButton();
			} else {
				this.viewerContainer.hidePlayButton();
			}
		}
	}

	// Public methods for external control
	public togglePlayPause() {
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
	}

	public getIsPlaying(): boolean {
		return this.isPlaying;
	}

	public stop() {
		if (this.isPlaying) {
			this.pause();
		}
		// Reset to initial state
		this.viewerContainer.hideCanvas();
		this.viewerContainer.showPlaceholder();
	}
}