import { ShaderConfig } from '../types/shader-config';
import { ViewerContainer } from './viewer-container';
import { GLSLRenderer } from '../core/renderer';

export class ControlsManager {
	private viewerContainer: ViewerContainer;
	private glslRenderer: GLSLRenderer | null;
	private config: ShaderConfig;
	private isPlaying: boolean;
	private shaderCode: string;
	private onCreateRenderer?: (viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig) => Promise<GLSLRenderer | null>;

	constructor(
		viewerContainer: ViewerContainer,
		glslRenderer: GLSLRenderer,
		config: ShaderConfig,
		shaderCode: string,
		onCreateRenderer?: (viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig) => Promise<GLSLRenderer | null>
	) {
		this.viewerContainer = viewerContainer;
		this.glslRenderer = glslRenderer;
		this.config = config;
		this.shaderCode = shaderCode;
		this.isPlaying = config.autoplay;
		this.onCreateRenderer = onCreateRenderer;

		this.setupEventListeners();
		this.updatePlayButton();
	}

	private setupEventListeners() {
		const playButton = this.viewerContainer.getPlayButton();
		const stopButton = this.viewerContainer.getStopButton();
		const playOverlay = this.viewerContainer.getPlayOverlay();

		if (playButton) {
			// Pause-only button (only pauses, doesn't resume)
			playButton.addEventListener('click', () => {
				if (this.isPlaying && this.glslRenderer) {
					this.pause();
				}
			});
		}

		if (stopButton) {
			// Stop button (stops and destroys renderer, returns to thumbnail)
			stopButton.addEventListener('click', () => {
				this.stop();
			});
		}

		if (playOverlay) {
			// Play-only overlay (starts playback)
			playOverlay.addEventListener('click', async () => {
				if (!this.isPlaying) {
					await this.play();
				}
			});
		}
	}

	private async play() {
		// レンダラーが存在しない場合（停止後など）は新しいレンダラーを作成
		if (!this.glslRenderer && this.onCreateRenderer) {
			this.glslRenderer = await this.onCreateRenderer(this.viewerContainer, this.shaderCode, this.config);
			if (!this.glslRenderer) {
				return; // レンダラー作成に失敗
			}
		}

		if (this.glslRenderer) {
			this.glslRenderer.play();
		}

		this.viewerContainer.hidePlayOverlay();

		// Switch from placeholder to canvas (check if placeholder is visible)
		const placeholder = this.viewerContainer.getPlaceholder();
		if (placeholder && placeholder.classList.contains('visible')) {
			this.viewerContainer.hidePlaceholder();
			this.viewerContainer.showCanvas();
		}

		this.isPlaying = true;
		this.updatePlayButton();
	}

	private pause() {
		if (this.glslRenderer) {
			this.glslRenderer.pause();
		}
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
				this.viewerContainer.showStopButton();
			} else {
				this.viewerContainer.hidePlayButton();
				this.viewerContainer.hideStopButton();
			}
		}
	}

	// Public methods for external control
	public async togglePlayPause() {
		if (this.isPlaying) {
			this.pause();
		} else {
			await this.play();
		}
	}

	public getIsPlaying(): boolean {
		return this.isPlaying;
	}

	public stop() {
		// Stop playback
		if (this.isPlaying && this.glslRenderer) {
			this.glslRenderer.pause();
			this.isPlaying = false;
		}

		// Destroy the renderer to free WebGL context
		if (this.glslRenderer) {
			this.glslRenderer.destroy();
			this.glslRenderer = null; // レンダラーへの参照をクリア
		}

		// Reset UI to initial state (thumbnail view)
		this.viewerContainer.hidePlayButton();
		this.viewerContainer.hideStopButton();
		this.viewerContainer.hideCanvas();
		this.viewerContainer.showPlaceholder();
		this.viewerContainer.showPlayOverlay();
	}
}