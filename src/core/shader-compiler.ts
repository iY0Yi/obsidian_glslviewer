import { ShaderPrecision } from '../types/shader-config';

export type CompileResult =
	| { success: true; program: WebGLProgram }
	| { success: false; error: string };

export type ShaderResult =
	| { success: true; shader: WebGLShader }
	| { success: false; error: string };

export class ShaderCompiler {
	private gl: WebGLRenderingContext;
	private isWebGL2: boolean;

	constructor(gl: WebGLRenderingContext, isWebGL2: boolean) {
		this.gl = gl;
		this.isWebGL2 = isWebGL2;
	}

	createVertexShader(precision: ShaderPrecision = 'highp'): string {
		return this.isWebGL2 ?
			`#version 300 es
			precision ${precision} float;
			in vec4 position;
			void main() {
				gl_Position = position;
			}` :
			`precision ${precision} float;
			attribute vec4 position;
			void main() {
				gl_Position = position;
			}`;
	}

	compileProgram(fragmentShader: string, precision: ShaderPrecision = 'highp'): CompileResult {
		const vertexShader = this.createVertexShader(precision);

		try {
			const result = this.createProgram(vertexShader, fragmentShader);
			if (!result.success) {
				return result;
			}

			return result;
		} catch (error) {
		const errorMessage = (error && typeof error === 'object' && 'message' in error)
			? (error as Error).message
			: String(error);
		return { success: false, error: errorMessage };
		}
	}

	private createProgram(vertexSource: string, fragmentSource: string): CompileResult {
		const vertexResult = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
		if (!vertexResult.success) {
			const vertexError = 'error' in vertexResult ? vertexResult.error : 'Unknown vertex shader error';
			return { success: false, error: `Vertex shader error:\n${vertexError}` };
		}
		const vertexShader = vertexResult.shader;

		const fragmentResult = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
		if (!fragmentResult.success) {
			const fragmentError = 'error' in fragmentResult ? fragmentResult.error : 'Unknown fragment shader error';
			return { success: false, error: `Fragment shader error:\n${fragmentError}` };
		}
		const fragmentShader = fragmentResult.shader;

		const program = this.gl.createProgram();
		if (!program) {
			return { success: false, error: 'Failed to create WebGL program' };
		}

		this.gl.attachShader(program, vertexShader);
		this.gl.attachShader(program, fragmentShader);
		this.gl.linkProgram(program);

		if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
			const rawLinkError = this.gl.getProgramInfoLog(program) || 'Unknown link error';
			const linkError = ShaderCompiler.sanitizeMessage(rawLinkError);
			this.gl.deleteProgram(program);
			return { success: false, error: `Program link error:\n${linkError}` };
		}

		// Clean up shaders (they're no longer needed after linking)
		this.gl.deleteShader(vertexShader);
		this.gl.deleteShader(fragmentShader);

		return { success: true, program };
	}

	private createShader(type: number, source: string): ShaderResult {
		const shader = this.gl.createShader(type);
		if (!shader) {
			return { success: false, error: 'Failed to create shader' };
		}

		this.gl.shaderSource(shader, source);
		this.gl.compileShader(shader);

		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			const rawError = this.gl.getShaderInfoLog(shader) || 'Unknown compilation error';
			const compileError = ShaderCompiler.sanitizeMessage(rawError);
			this.gl.deleteShader(shader);
			return { success: false, error: compileError };
		}

		return { success: true, shader };
	}

	static cleanErrorMessage(error: string): string {
		return ShaderCompiler.sanitizeMessage(error);
	}

	private static sanitizeMessage(message: string): string {
		let sanitized = '';
		for (let i = 0; i < message.length; i++) {
			const char = message[i];
			const code = char.charCodeAt(0);
			const isControlCharacter =
				(code >= 0x00 && code <= 0x08) ||
				code === 0x0B ||
				code === 0x0C ||
				(code >= 0x0E && code <= 0x1F) ||
				(code >= 0x7F && code <= 0x9F);
			if (!isControlCharacter) {
				sanitized += char;
			}
		}
		return sanitized.trim();
	}
}
