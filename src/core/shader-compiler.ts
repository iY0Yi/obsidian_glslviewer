export interface CompileResult {
	success: boolean;
	error?: string;
	program?: WebGLProgram;
}

export interface ShaderResult {
	success: boolean;
	error?: string;
	shader?: WebGLShader;
}

export class ShaderCompiler {
	private gl: WebGLRenderingContext;
	private isWebGL2: boolean;

	constructor(gl: WebGLRenderingContext, isWebGL2: boolean) {
		this.gl = gl;
		this.isWebGL2 = isWebGL2;
	}

	createVertexShader(): string {
		return this.isWebGL2 ?
			`#version 300 es
			precision mediump float;
			in vec4 position;
			void main() {
				gl_Position = position;
			}` :
			`precision mediump float;
			attribute vec4 position;
			void main() {
				gl_Position = position;
			}`;
	}

	compileProgram(fragmentShader: string): CompileResult {
		const vertexShader = this.createVertexShader();

		try {
			const result = this.createProgram(vertexShader, fragmentShader);
			if (!result.success) {
				return { success: false, error: result.error };
			}

			return { success: true, program: result.program };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { success: false, error: errorMessage };
		}
	}

	private createProgram(vertexSource: string, fragmentSource: string): CompileResult {
		const vertexResult = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
		if (!vertexResult.success) {
			return { success: false, error: `Vertex shader error:\n${vertexResult.error}` };
		}

		const fragmentResult = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
		if (!fragmentResult.success) {
			return { success: false, error: `Fragment shader error:\n${fragmentResult.error}` };
		}

		const program = this.gl.createProgram();
		if (!program) {
			return { success: false, error: 'Failed to create WebGL program' };
		}

		this.gl.attachShader(program, vertexResult.shader!);
		this.gl.attachShader(program, fragmentResult.shader!);
		this.gl.linkProgram(program);

		if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
			const rawLinkError = this.gl.getProgramInfoLog(program) || 'Unknown link error';
			// Remove control characters except newlines (\n, \r)
			const linkError = rawLinkError.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
			this.gl.deleteProgram(program);
			return { success: false, error: `Program link error:\n${linkError}` };
		}

		// Clean up shaders (they're no longer needed after linking)
		this.gl.deleteShader(vertexResult.shader!);
		this.gl.deleteShader(fragmentResult.shader!);

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
			// Remove control characters except newlines (\n, \r)
			const compileError = rawError.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
			this.gl.deleteShader(shader);
			return { success: false, error: compileError };
		}

		return { success: true, shader };
	}

	static cleanErrorMessage(error: string): string {
		// Remove control characters except newlines (\n, \r)
		return error.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
	}
}