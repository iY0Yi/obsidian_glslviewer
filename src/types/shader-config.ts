export type SliderUniform = {
	type: 'slider';
	name: string;
	value: number;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
};

export type ToggleUniform = {
	type: 'toggle';
	name: string;
	value: number;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
};

export type ColorUniform = {
	type: 'color';
	name: string;
	value: [number, number, number];
	defaultValue: [number, number, number];
	min: number;
	max: number;
	step: number;
};

export type CustomUniform = SliderUniform | ToggleUniform | ColorUniform;

export interface ShaderConfig {
	aspect: number;
	autoplay: boolean;
	hideCode: boolean;
	template?: string;
	templates?: string[];
	customUniforms?: CustomUniform[];
	iChannel0?: string;
	iChannel1?: string;
	iChannel2?: string;
	iChannel3?: string;
}
