export interface TextureShortcut {
	key: string;
	path: string;
}

export interface GLSLViewerSettings {
	defaultAspect: number;
	defaultAutoplay: boolean;
	defaultHideCode: boolean;
	textureFolder: string;
	textureShortcuts: TextureShortcut[];
	templatesFolder: string;
	thumbnailsFolder: string;
}

export const DEFAULT_SETTINGS: GLSLViewerSettings = {
	defaultAspect: 0.5625, // 16:9 aspect ratio (9/16)
	defaultAutoplay: false,
	defaultHideCode: false,
	textureFolder: '',
	textureShortcuts: [],
	templatesFolder: 'GLSL Templates',
	thumbnailsFolder: 'GLSL Thumbnails',
};