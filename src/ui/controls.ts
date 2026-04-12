import { CustomUniform, ShaderConfig } from '../types/shader-config';
import { ViewerContainer } from './viewer-container';
import { GLSLRenderer } from '../core/renderer';

type UniformControlBinding = {
	uniform: CustomUniform;
	applyValueToControl: () => void;
};

export class ControlsManager {
	private viewerContainer: ViewerContainer;
	private glslRenderer: GLSLRenderer | null;
	private config: ShaderConfig;
	private isPlaying: boolean;
	private shaderCode: string;
	private onCreateRenderer?: (viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig) => Promise<GLSLRenderer | null>;
	private onRendererUpdate?: (renderer: GLSLRenderer | null) => void;
	private onPersistDefaults?: (customUniforms: CustomUniform[]) => Promise<boolean>;
	private uniformControlBindings: UniformControlBinding[] = [];
	private isPersistingDefaults: boolean = false;
	private setDefaultsButton: HTMLButtonElement | null = null;
	private resetDefaultsButton: HTMLButtonElement | null = null;

	constructor(
		viewerContainer: ViewerContainer,
		glslRenderer: GLSLRenderer,
		config: ShaderConfig,
		shaderCode: string,
		onCreateRenderer?: (viewerContainer: ViewerContainer, shaderCode: string, config: ShaderConfig) => Promise<GLSLRenderer | null>,
		onRendererUpdate?: (renderer: GLSLRenderer | null) => void,
		onPersistDefaults?: (customUniforms: CustomUniform[]) => Promise<boolean>,
	) {
		this.viewerContainer = viewerContainer;
		this.glslRenderer = glslRenderer;
		this.config = config;
		this.shaderCode = shaderCode;
		this.isPlaying = config.autoplay;
		this.onCreateRenderer = onCreateRenderer;
		this.onRendererUpdate = onRendererUpdate;
		this.onPersistDefaults = onPersistDefaults;

		this.createSliderControls();
		this.createDefaultButtons();
		this.setupEventListeners();
		this.updatePlayButton();

		this.onRendererUpdate?.(this.glslRenderer);
	}

	private cloneUniformValue(value: number | [number, number, number]): number | [number, number, number] {
		if (Array.isArray(value)) {
			return [value[0], value[1], value[2]];
		}
		return value;
	}

	private areUniformValuesEqual(
		a: number | [number, number, number],
		b: number | [number, number, number],
		type: CustomUniform['type'],
	): boolean {
		if (type === 'color') {
			if (!Array.isArray(a) || !Array.isArray(b)) {
				return false;
			}
			const epsilon = 1 / 255;
			return Math.abs(a[0] - b[0]) <= epsilon
				&& Math.abs(a[1] - b[1]) <= epsilon
				&& Math.abs(a[2] - b[2]) <= epsilon;
		}

		return typeof a === 'number' && typeof b === 'number' && a === b;
	}

	private hasNonDefaultCustomUniforms(): boolean {
		const customUniforms = this.config.customUniforms ?? [];
		for (const customUniform of customUniforms) {
			if (!this.areUniformValuesEqual(customUniform.value, customUniform.defaultValue, customUniform.type)) {
				return true;
			}
		}
		return false;
	}

	private updateResetDefaultsVisibility(): void {
		if (!this.resetDefaultsButton) {
			return;
		}
		this.resetDefaultsButton.hidden = !this.hasNonDefaultCustomUniforms();
	}

	private createDefaultButtons(): void {
		const customUniforms = this.config.customUniforms ?? [];
		if (customUniforms.length === 0) {
			return;
		}

		const controls = this.viewerContainer.getControls();
		const setDefaultsButton = document.createElement('button');
		setDefaultsButton.className = 'glsl-viewer-action-button';
			setDefaultsButton.textContent = 'Set defaults';
		setDefaultsButton.addEventListener('click', () => {
			void this.persistCurrentValuesAsDefaults();
		});
		controls.appendChild(setDefaultsButton);
		this.setDefaultsButton = setDefaultsButton;

		const resetDefaultsButton = document.createElement('button');
		resetDefaultsButton.className = 'glsl-viewer-action-button';
			resetDefaultsButton.textContent = 'Reset defaults';
		resetDefaultsButton.addEventListener('click', () => {
			this.resetDefaults();
		});
		controls.appendChild(resetDefaultsButton);
		this.resetDefaultsButton = resetDefaultsButton;

		this.updateResetDefaultsVisibility();
	}

	private createSliderControls() {
		const customUniforms = this.config.customUniforms ?? [];
		if (customUniforms.length === 0) {
			return;
		}

		const controlsContainer = this.viewerContainer.getContainer();
		const sliderPanel = document.createElement('div');
		sliderPanel.className = 'glsl-viewer-slider-panel';

		const clamp01 = (num: number) => Math.max(0, Math.min(1, num));
		const toHexByte = (num: number) => Math.round(clamp01(num) * 255).toString(16).padStart(2, '0');
		const colorArrayToHex = (color: [number, number, number]): string =>
			`#${toHexByte(color[0])}${toHexByte(color[1])}${toHexByte(color[2])}`;
		const hexToColorArray = (hex: string): [number, number, number] => {
			const normalized = hex.trim().replace(/^#/, '');
			if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
				return [1, 1, 1];
			}
			const r = parseInt(normalized.slice(0, 2), 16) / 255;
			const g = parseInt(normalized.slice(2, 4), 16) / 255;
			const b = parseInt(normalized.slice(4, 6), 16) / 255;
			return [r, g, b];
		};

		for (const customUniform of customUniforms) {
			const row = document.createElement('label');
			row.className = 'glsl-viewer-slider-row';

			const label = document.createElement('span');
			label.className = 'glsl-viewer-slider-label';
			label.textContent = customUniform.name;

			const value = document.createElement('span');
			value.className = 'glsl-viewer-slider-value';

			const input = document.createElement('input');
			let applyValueToControl: () => void = () => { };

			switch (customUniform.type) {
				case 'color':
					row.classList.add('glsl-viewer-color-row');
					input.className = 'glsl-viewer-color-input';
					input.type = 'color';
					applyValueToControl = () => {
						const color = customUniform.value;
						const hex = colorArrayToHex(color);
						input.value = hex;
						value.textContent = hex;
					};
					applyValueToControl();
					input.addEventListener('input', () => {
						const nextColor = hexToColorArray(input.value);
						customUniform.value = nextColor;
						const nextHex = colorArrayToHex(nextColor);
						value.textContent = nextHex;
						this.glslRenderer?.setCustomUniformValue(customUniform.name, nextColor);
						this.updateResetDefaultsVisibility();
					});
					break;
				case 'toggle':
					row.classList.add('glsl-viewer-toggle-row');
					input.className = 'glsl-viewer-toggle-input';
					input.type = 'checkbox';
					applyValueToControl = () => {
						input.checked = customUniform.value >= 0.5;
						value.textContent = input.checked ? '1' : '0';
					};
					applyValueToControl();
					input.addEventListener('change', () => {
						const nextValue = input.checked ? 1 : 0;
						customUniform.value = nextValue;
						value.textContent = `${nextValue}`;
						this.glslRenderer?.setCustomUniformValue(customUniform.name, nextValue);
						this.updateResetDefaultsVisibility();
					});
					break;
				default:
					input.className = 'glsl-viewer-slider-input';
					input.type = 'range';
					input.min = `${customUniform.min}`;
					input.max = `${customUniform.max}`;
					input.step = `${customUniform.step}`;
					applyValueToControl = () => {
						input.value = `${customUniform.value}`;
						value.textContent = `${customUniform.value}`;
					};
					applyValueToControl();
					input.addEventListener('input', () => {
						const nextValue = parseFloat(input.value);
						customUniform.value = nextValue;
						value.textContent = `${nextValue}`;
						this.glslRenderer?.setCustomUniformValue(customUniform.name, nextValue);
						this.updateResetDefaultsVisibility();
					});
					break;
			}

			this.uniformControlBindings.push({ uniform: customUniform, applyValueToControl });
			row.appendChild(label);
			row.appendChild(input);
			row.appendChild(value);
			sliderPanel.appendChild(row);
		}

		controlsContainer.appendChild(sliderPanel);
	}

	private async persistCurrentValuesAsDefaults(): Promise<void> {
		if (this.isPersistingDefaults || !this.onPersistDefaults) {
			return;
		}

		this.isPersistingDefaults = true;
		if (this.setDefaultsButton) {
			this.setDefaultsButton.disabled = true;
		}

			try {
				const success = await this.onPersistDefaults(this.config.customUniforms ?? []);
				if (success) {
					for (const customUniform of this.config.customUniforms ?? []) {
						if (customUniform.type === 'color') {
							customUniform.defaultValue = [...customUniform.value];
						} else {
							customUniform.defaultValue = customUniform.value;
						}
					}
					this.updateResetDefaultsVisibility();
				}
		} finally {
			this.isPersistingDefaults = false;
			if (this.setDefaultsButton) {
				this.setDefaultsButton.disabled = false;
			}
		}
	}

	private resetDefaults(): void {
		for (const binding of this.uniformControlBindings) {
			const { uniform, applyValueToControl } = binding;
			if (uniform.type === 'color') {
				uniform.value = [...uniform.defaultValue];
			} else {
				uniform.value = uniform.defaultValue;
			}
			applyValueToControl();
			this.glslRenderer?.setCustomUniformValue(uniform.name, uniform.value);
		}

		this.updateResetDefaultsVisibility();
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
			playOverlay.addEventListener('click', () => {
				if (!this.isPlaying) {
					void this.play();
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
			this.syncCustomUniforms();
			this.onRendererUpdate?.(this.glslRenderer);
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

	private syncCustomUniforms(): void {
		for (const customUniform of this.config.customUniforms ?? []) {
			this.glslRenderer?.setCustomUniformValue(customUniform.name, customUniform.value);
		}
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
			this.glslRenderer.unload();
			this.glslRenderer = null; // レンダラーへの参照をクリア
			this.onRendererUpdate?.(null);
		}

		// Reset UI to initial state (thumbnail view)
		this.viewerContainer.hidePlayButton();
		this.viewerContainer.hideStopButton();
		this.viewerContainer.hideCanvas();
		this.viewerContainer.showPlaceholder();
		this.viewerContainer.showPlayOverlay();
	}
}
