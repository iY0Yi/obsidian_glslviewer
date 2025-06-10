export function wrapShaderCode(shaderCode: string, isWebGL2: boolean): string {
	if (isWebGL2) {
		// WebGL2 (GLSL ES 3.00) shader
		const header = `#version 300 es
precision mediump float;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec3 iChannelResolution[4];

out vec4 fragColor;

// Shadertoy compatibility macros
#define texture2D texture
#define textureCube texture

`;

		// Footer that calls mainImage function
		const footer = `
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
`;

		return header + shaderCode + footer;
	} else {
		// WebGL1 (GLSL ES 1.00) shader
		const header = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec3 iChannelResolution[4];

`;

		// Footer that calls mainImage function
		const footer = `
void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

		return header + shaderCode + footer;
	}
}