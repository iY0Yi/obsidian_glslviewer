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
		titleDiv.textContent = 'GLSL Shader Error';

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
		// Remove control characters except newlines (\n, \r)
		return message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
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