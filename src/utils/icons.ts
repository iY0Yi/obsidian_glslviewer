import { addIcon, setIcon } from 'obsidian';

const ICON_DEFINITIONS = {
	play:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M19.5,91.8V8.2l65.7,41.8L19.5,91.8ZM31.5,70l31.3-20-31.3-20v40Z"/></svg>`,
	pause:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M55,85V15h30v70h-30ZM15,85V15h30v70H15ZM65,75h10V25h-10v50ZM25,75h10V25h-10v50ZM25,25v50V25ZM65,25v50V25Z"/></svg>`,
	stop:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M26.7,26.7v46.7V26.7ZM15,85V15h70v70H15ZM26.7,73.3h46.7V26.7H26.7v46.7Z"/></svg>`,
	add:         `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M44.6,55.4H12.4v-10.8h32.2V12.4h10.8v32.2h32.2v10.8h-32.2v32.2h-10.8v-32.2Z"/></svg>`,
	close:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M19.9,87.7l-7.6-7.6,30.1-30.1L12.3,19.9l7.6-7.6,30.1,30.1,30.1-30.1,7.6,7.6-30.1,30.1,30.1,30.1-7.6,7.6-30.1-30.1-30.1,30.1Z"/></svg>`,
	folder:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M19.3,80.7c-2.1,0-3.9-.8-5.4-2.3s-2.3-3.3-2.3-5.4V27c0-2.1.8-3.9,2.3-5.4s3.3-2.3,5.4-2.3h23l7.7,7.7h30.7c2.1,0,3.9.8,5.4,2.3s2.3,3.3,2.3,5.4v38.4c0,2.1-.8,3.9-2.3,5.4s-3.3,2.3-5.4,2.3H19.3ZM19.3,73h61.4v-38.4h-33.9l-7.7-7.7h-19.9v46.1ZM19.3,73V27v46.1Z"/></svg>`,
	folder_open: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M16.4,80.7c-2.1,0-3.9-.8-5.4-2.3s-2.3-3.3-2.3-5.4V27c0-2.1.8-3.9,2.3-5.4s3.3-2.3,5.4-2.3h23l7.7,7.7h30.7c2.1,0,3.9.8,5.4,2.3s2.3,3.3,2.3,5.4h-41.6l-7.7-7.7h-19.9v46.1l9.2-30.7h65.7l-9.9,32.9c-.5,1.7-1.5,3-2.8,4s-2.9,1.5-4.6,1.5H16.4ZM24.5,73h49.5l6.9-23H31.4l-6.9,23ZM24.5,73l6.9-23-6.9,23ZM16.4,34.6v-7.7,7.7Z"/></svg>`,
	imagesmode:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M23.1,84.6c-2.1,0-3.9-.8-5.4-2.3-1.5-1.5-2.3-3.3-2.3-5.4V23.1c0-2.1.8-3.9,2.3-5.4,1.5-1.5,3.3-2.3,5.4-2.3h53.8c2.1,0,3.9.8,5.4,2.3s2.3,3.3,2.3,5.4v53.8c0,2.1-.8,3.9-2.3,5.4-1.5,1.5-3.3,2.3-5.4,2.3H23.1ZM23.1,76.9h53.8V23.1H23.1v53.8ZM27,69.2h46.1l-14.4-19.2-11.5,15.4-8.6-11.5-11.5,15.4ZM23.1,76.9V23.1v53.8ZM36.6,42.3c1.6,0,3-.6,4.1-1.7s1.7-2.5,1.7-4.1-.6-3-1.7-4.1-2.5-1.7-4.1-1.7-3,.6-4.1,1.7-1.7,2.5-1.7,4.1.6,3,1.7,4.1,2.5,1.7,4.1,1.7Z"/></svg>`,
	copy:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M18 20h40a8 8 0 0 1 8 8v52H18a8 8 0 0 1-8-8V28a8 8 0 0 1 8-8Z"/><path fill="currentColor" d="M36 14h46a8 8 0 0 1 8 8v64a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z"/></svg>`,
	refresh:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M50,87.7c-10.5,0-19.4-3.6-26.7-10.9-7.3-7.3-10.9-16.2-10.9-26.7s3.6-19.4,10.9-26.7c7.3-7.3,16.2-10.9,26.7-10.9s10.6,1.1,15.5,3.4c4.9,2.2,9.2,5.4,12.7,9.6v-12.9h9.4v33h-33v-9.4h19.8c-2.5-4.4-5.9-7.8-10.3-10.4s-9.1-3.8-14.2-3.8c-7.8,0-14.5,2.7-20,8.2s-8.2,12.2-8.2,20,2.7,14.5,8.2,20,12.2,8.2,20,8.2,11.5-1.7,16.4-5.2c4.9-3.5,8.3-8,10.2-13.7h9.9c-2.2,8.3-6.7,15.1-13.4,20.4-6.7,5.3-14.4,7.9-23.1,7.9Z"/></svg>`,
	skull:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M240-80v-170q-39-17-68.5-45.5t-50-64.5q-20.5-36-31-77T80-520q0-158 112-259t288-101q176 0 288 101t112 259q0 42-10.5 83t-31 77q-20.5 36-50 64.5T720-250v170H240Zm80-80h40v-80h80v80h80v-80h80v80h40v-142q38-9 67.5-30t50-50q20.5-29 31.5-64t11-74q0-125-88.5-202.5T480-800q-143 0-231.5 77.5T160-520q0 39 11 74t31.5 64q20.5 29 50.5 50t67 30v142Zm100-200h120l-60-120-60 120Zm-80-80q33 0 56.5-23.5T420-520q0-33-23.5-56.5T340-600q-33 0-56.5 23.5T260-520q0 33 23.5 56.5T340-440Zm280 0q33 0 56.5-23.5T700-520q0-33-23.5-56.5T620-600q-33 0-56.5 23.5T540-520q0 33 23.5 56.5T620-440ZM480-160Z"/></svg>`
} as const;

export type GLSLIconName = keyof typeof ICON_DEFINITIONS;

let iconsRegistered = false;
const ICON_VIEWBOXES: Record<GLSLIconName, string> = Object.fromEntries(
	Object.entries(ICON_DEFINITIONS)
		.map(([name, svg]) => {
			const match = svg.match(/viewBox="([^"]+)"/);
			return [name as GLSLIconName, match ? match[1] : ''];
		})
) as Record<GLSLIconName, string>;

export function registerGLSLViewerIcons(): void {
	if (iconsRegistered) return;
	iconsRegistered = true;

	for (const [name, svg] of Object.entries(ICON_DEFINITIONS)) {
		addIcon(`glsl-${name}`, svg);
	}
}

export function setGLSLIcon(element: HTMLElement, iconName: GLSLIconName): void {
	setIcon(element, `glsl-${iconName}`);
	const svg = element.querySelector('svg');
	if (svg) {
		const viewBox = ICON_VIEWBOXES[iconName];
		if (viewBox) {
			svg.setAttribute('viewBox', viewBox);
		}
		svg.setAttribute('width', '24');
		svg.setAttribute('height', '24');
	}
}
