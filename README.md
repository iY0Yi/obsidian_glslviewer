# GLSL Viewer Plugin for Obsidian

A GLSL shader preview plugin for Obsidian that enables real-time WebGL rendering with Shadertoy-style shader code.
</br></br></br>
## Features


### Shadertoy Compatibility  _(Limited)_
![Shadertoy compatibility](assets/imgs/demo_shadertoy.jpg)

*Same syntax as Shadertoy - easily port your creations and reuse code snippets between platforms*

### Custom Textures
![Custom Textures](assets/imgs/demo_textures.jpg)

*Load images from your vault as textures (iChannel0-3)*

### Template System
![Custom Template](assets/imgs/demo_template.jpg)

*Use templates to simplify complex shaders - write minimal code, get maximum results*

### And more
- 📸 **Thumbnail generation**: Automatic thumbnails for non-autoplay shaders
- ⚙️ Configurable canvas ratio, autoplay, and code visibility
- 🔧 Flexible configuration using comments in code blocks
- 🎯 **Texture shortcuts**: Quick reference to frequently used textures
- 📁 **Texture browser**: Visual texture selection with folder filtering
- 🙈 **@hideCode**: Show only the viewer or with code
- 📁 **Configurable folders**: Set custom locations for templates and thumbnails
- 🎯 **Works with syntax highlighters**: No conflicts with other code plugins (Shiki Highlighter)
</br></br></br>
## Installation

1. Copy this plugin to your Obsidian plugins folder
2. Enable the plugin in Obsidian settings
</br></br></br>
## Usage
Use standard `glsl` code blocks with `@viewer` directive:

### **Directive Styles:**

**Single-line comments:**
````glsl
```glsl
// @viewer
// @aspect: 0.75
// @autoplay: true
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xxy + vec3(0, 2, 4));
    fragColor = vec4(col, 1.0);
}
```
````

**Multi-line comments**:
````glsl
```glsl
/*
@viewer
@aspect: 0.75
@autoplay: true
@hideCode: true
@iChannel0: assets/texture.png
*/
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xxy + vec3(0, 2, 4));
    fragColor = vec4(col, 1.0);
}
```
````

### Basic Example
````glsl
```glsl
// @viewer
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xxy + vec3(0, 2, 4));
    fragColor = vec4(col, 1.0);
}
```
````

### Setting Example
````glsl

```glsl
// @viewer
// @aspect: 1.0
// @autoplay: true
// @iChannel0: assets/images/texture.jpg
// @hideCode: true
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord-iResolution.xy*.5) / iResolution.y;
    uv+=vec2(sin(iTime),cos(iTime));
    vec3 texColor = texture(iChannel0, uv * 2.0).rgb;
    vec3 col = texColor;
    fragColor = vec4(col, 1.0);
}
```
````

### Template Example

Templates enable the creation of complex shader patterns with minimal code.</br>
Create custom templates in your configured templates folder (default: `GLSL Templates/`).</br>
Share complex setups across multiple shaders.

````glsl
```glsl
// @viewer
// @template: raymarching.glsl
vec4 map(vec3 p) {
    float d = length(p) - 0.5;  // Sphere distance function
    return vec4(d, COL_S2);     // Return distance and material color
}
```
````

### Using Textures

**Three ways to specify textures:**
- **Shortcuts**: `tex1` (configured in settings)
- **Filenames**: `wood.png` (when Texture Folder is set)
- **Full paths**: `images/wood.png` (relative to vault root)

### Texture Shortcuts

Create shortcuts for frequently used textures in plugin settings.</br>
Shortcuts are always relative to your Texture Folder setting:

````glsl
```glsl
// @viewer
// @iChannel0: tex1      // Uses shortcut 'tex1' → {TextureFolder}/wood.png
// @iChannel1: noise     // Uses shortcut 'noise' → {TextureFolder}/noise.jpg
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 tex = texture(iChannel0, uv).rgb;    // wood texture
    vec3 n = texture(iChannel1, uv).rgb;      // noise texture
    fragColor = vec4(mix(tex, n, 0.5), 1.0);
}
```
````

**Configure shortcuts in Settings → GLSL Viewer → Texture Shortcuts**



</br></br></br>
## Configuration Options

### Comment Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `@viewer` | Enable viewer for `glsl` code blocks | - |
| `@aspect: number` | Canvas aspect ratio (height/width) | 0.5625 |
| `@autoplay: true/false` | Auto-start animation | false |
| `@hideCode: true/false` | Hide code block, show viewer only | false |
| `@template: filename` | Use template from templates folder | - |

**Note**: `@viewer` directive is required only for `glsl` code blocks. `glsl-viewer` blocks are always processed.

### Available Uniforms

- `vec3 iResolution` - Screen resolution ✅
- `float iTime` - Elapsed time ✅
- `float iTimeDelta` - Frame delta time ✅
- `int iFrame` - Frame number ✅
- `vec4 iMouse` - Mouse position (Shadertoy-compatible) ✅
- `vec4 iDate` - Date info (year, month, day, seconds) ✅
- `sampler2D iChannel0-3` - Textures ✅
- `vec3 iChannelResolution[4]` - Texture resolutions (width, height, 1.0) ✅

</br></br></br>

## Technical Details

- **Shader Type**: Fragment shaders only
- **Entry Point**: `mainImage(out vec4 fragColor, in vec2 fragCoord)`
- **Textures**: Load images from anywhere in your vault with flexible path resolution
- **Templates**: Custom templates with `@TEMPLATE_LINES` placeholder replacement
- **Thumbnails**: Auto-generated for non-autoplay shaders, stored in configurable folder
- **Texture Folder**: Serves as base directory for relative texture paths and shortcuts


### Plugin Settings

Access via Settings → Community plugins → GLSL Viewer:

**Display Settings:**
- **Default Aspect Ratio**: Canvas ratio for new shaders
- **Default Autoplay**: Whether new shaders auto-start by default
- **Default Hide Code**: Whether to hide code blocks by default

**Folders:** _(in setup priority order)_
- **Thumbnails Folder**: Where generated thumbnails are stored (default: `GLSL Thumbnails`)
- **Texture Folder**: Base folder for texture paths and browsing (optional)
- **Templates Folder**: Where GLSL templates are stored (default: `GLSL Templates`)

**Texture Shortcuts:**
- Create shortcuts for frequently used textures (e.g., `tex1`, `noise`)
- All shortcuts are relative to the Texture Folder setting

### Creating Templates

1. Create a `.glsl` file in your Templates Folder (default: `GLSL Templates/`)
2. Use `@TEMPLATE_LINES` where your code should be inserted
3. Reference with `// @template: filename.glsl`
</br></br></br>
## Development

```bash
npm install
npm run dev    # Development mode
npm run build  # Production build
```
</br></br></br>
## License

MIT License
</br></br></br>
## Compatibility

- **Obsidian**: v1.0.0+
- **Shiki-highlighter**
