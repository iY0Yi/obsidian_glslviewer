# GLSL Viewer Plugin for Obsidian

A GLSL shader preview plugin for Obsidian that enables real-time WebGL rendering with Shadertoy-style shader code.

## Features

- 📦 Shadertoy-compatible GLSL shader execution
- 🎮 Play/pause controls
- 🖼️ Texture loading (iChannel0-3)
- ⚙️ Configurable canvas ratio
- 🔧 In-code block configuration

## Installation

1. Copy this plugin to your Obsidian plugins folder
2. Enable the plugin in Obsidian settings

## Usage

**Primary**: Create a code block with `glsl-viewer` language:

### Basic Example

```glsl-viewer
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = 0.5 + 0.5 * cos(iTime + uv.xxy + vec3(0, 2, 4));
    fragColor = vec4(col, 1.0);
}
```

### Animation Example

```glsl-viewer
// @aspect: 1.0
// @autoplay: true

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    float t = iTime;
    vec3 col = vec3(0.0);

    for (int i = 0; i < 3; i++) {
        float angle = float(i) * 2.09 + t * 0.5;
        vec2 pos = vec2(cos(angle), sin(angle)) * 0.3;
        float dist = length(uv - pos);
        col[i] = 0.01 / dist;
    }

    fragColor = vec4(col, 1.0);
}
```

### Setting Example

```glsl-viewer
// @aspect: 1.0
// @iChannel0: assets/images/texture.jpg
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    // Time-based animation
    float time = iTime;
    float timeDelta = iTimeDelta;

    // Frame-based discrete changes
    float pulse = sin(float(iFrame) * 0.1);

    // Date-based variation
    float dayFactor = iDate.z / 31.0;

    // Texture sampling (WebGL1/2 compatible)
    vec3 texColor = texture(iChannel0, uv * 2.0 + time * 0.1).rgb;

    // Complex color calculation
    vec3 col = texColor * (0.5 + 0.5 * cos(time + uv.x * 3.0 + pulse)) * dayFactor;

    fragColor = vec4(col, 1.0);
}
```

### Texture Path Formats

| Path Type | Example | Description |
|-----------|---------|-------------|
| **Vault-relative** | `images/texture.jpg` | Relative to vault root |
| **Subfolder** | `assets/textures/noise.png` | Files in subfolders |

## Configuration Options

### Comment Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `@aspect: number` | Canvas aspect ratio (height/width) | 0.5625 |
| `@autoplay: true/false` | Auto-start animation | false |
| `@iChannel0: path` | Texture file path | - |
| `@iChannel1: path` | Texture file path | - |
| `@iChannel2: path` | Texture file path | - |
| `@iChannel3: path` | Texture file path | - |

### Available Uniforms

- `vec3 iResolution` - Screen resolution ✅
- `float iTime` - Elapsed time ✅
- `float iTimeDelta` - Frame delta time ✅
- `int iFrame` - Frame number ✅
- `vec4 iMouse` - Mouse position (Shadertoy-compatible) ✅
- `vec4 iDate` - Date info (year, month, day, seconds) ✅
- `sampler2D iChannel0-3` - Textures ✅

## Technical Details

- **Rendering**: Pure WebGL implementation (no external dependencies)
- **Shader Type**: Fragment shaders only
- **Entry Point**: `mainImage(out vec4 fragColor, in vec2 fragCoord)`
- **Textures**: Obsidian vault files supported
- **Performance**: Configurable concurrent shader limit

### Plugin Settings

Access via Settings → Community plugins → GLSL Viewer:

- **Maximum Active Viewers**: Performance control (1-50)
- **Default Aspect Ratio**: Canvas ratio for new shaders
- **Default Textures**: Auto-loaded textures for iChannel0-3

## Development

```bash
npm install
npm run dev    # Development mode
npm run build  # Production build
```

## License

MIT License

## Compatibility

- **Obsidian**: v1.0.0+
