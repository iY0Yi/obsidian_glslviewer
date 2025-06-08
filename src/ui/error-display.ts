export class ErrorDisplay {
	private container: HTMLElement;

	constructor(container: HTMLElement) {
		this.container = container;
		this.ensureRelativePosition();
	}

	private ensureRelativePosition() {
		// Make container position relative to enable absolute positioning of error
		this.container.style.position = 'relative';
	}

	showError(message: string) {
		// Remove any existing error display
		this.clearError();

		// Create error overlay that covers the entire canvas area
		const errorDiv = document.createElement('div');
		errorDiv.className = 'glsl-viewer-error';

		// Style: full canvas coverage with red background
		errorDiv.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: #cc0000;
			color: white;
			font-family: monospace;
			font-size: 12px;
			padding: 20px;
			box-sizing: border-box;
			word-wrap: break-word;
			overflow-y: auto;
			z-index: 1000;
		`;

		// Add error title
		const titleDiv = document.createElement('div');
		titleDiv.textContent = 'GLSL Compilation Error';
		titleDiv.style.cssText = `
			font-weight: bold;
			font-size: 14px;
			margin-bottom: 10px;
			text-align: left;
		`;
		errorDiv.appendChild(titleDiv);

		// Add error message (clean up control characters but preserve newlines)
		const messageDiv = document.createElement('div');
		const cleanMessage = this.cleanErrorMessage(message);
		messageDiv.textContent = cleanMessage;
		messageDiv.style.cssText = `
			text-align: left;
			line-height: 1.4;
			max-width: 100%;
			white-space: pre-wrap;
		`;
		errorDiv.appendChild(messageDiv);

		// Add error div to container
		this.container.appendChild(errorDiv);
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
	static createAndShow(container: HTMLElement, message: string): ErrorDisplay {
		const errorDisplay = new ErrorDisplay(container);
		errorDisplay.showError(message);
		return errorDisplay;
	}
}