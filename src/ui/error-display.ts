export class ErrorDisplay {
	private container: HTMLElement;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	show(errorMessage: string) {
		// Clear any existing content
		this.clearError();

		// Create error display using CSS classes instead of inline styles
		const errorDiv = document.createElement('div');
		errorDiv.className = 'glsl-viewer-error';

		// Create title
		const titleDiv = document.createElement('div');
		titleDiv.className = 'glsl-viewer-error-title';
		titleDiv.textContent = 'Shader error';

		// Create message
		const messageDiv = document.createElement('div');
		messageDiv.className = 'glsl-viewer-error-message';
		messageDiv.textContent = this.cleanErrorMessage(errorMessage);

		// Assemble the error display
		errorDiv.appendChild(titleDiv);
		errorDiv.appendChild(messageDiv);
		this.container.appendChild(errorDiv);
	}

	hide() {
		this.clearError();
	}



	clearError() {
		const existingError = this.container.querySelector('.glsl-viewer-error');
		if (existingError) {
			existingError.remove();
		}
	}

	private cleanErrorMessage(message: string): string {
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

	hasError(): boolean {
		return this.container.querySelector('.glsl-viewer-error') !== null;
	}

	// Static method for creating error displays
	static createAndShow(container: HTMLElement, errorMessage: string): ErrorDisplay {
		const display = new ErrorDisplay(container);
		display.show(errorMessage);
		return display;
	}
}
