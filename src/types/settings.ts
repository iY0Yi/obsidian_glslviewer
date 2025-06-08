export interface GLSLViewerSettings {
	maxActiveViewers: number;
	defaultAspect: number;
	defaultIChannel0: string;
	defaultIChannel1: string;
	defaultIChannel2: string;
	defaultIChannel3: string;
}

export const DEFAULT_SETTINGS: GLSLViewerSettings = {
	maxActiveViewers: 10,
	defaultAspect: 0.5625, // 16:9 aspect ratio (9/16)
	defaultIChannel0: '',
	defaultIChannel1: '',
	defaultIChannel2: '',
	defaultIChannel3: '',
};