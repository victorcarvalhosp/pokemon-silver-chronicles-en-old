// RGSS sprite/viewport colour effects as one shader:
//   tone  (r,g,b in -255..255, gray 0..255): desaturate by gray, then add rgb
//   color (r,g,b,a 0..255): blend toward rgb by a/255 (flashes, fades)
import { Filter, GlProgram } from "pixi.js";
import type { Color, Tone } from "./types";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uTone;
uniform vec4 uColor;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  if (c.a <= 0.0) { finalColor = c; return; }
  vec3 rgb = c.rgb / c.a;
  float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = mix(rgb, vec3(lum), uTone.w);
  rgb = clamp(rgb + uTone.xyz, 0.0, 1.0);
  rgb = mix(rgb, uColor.rgb, uColor.a);
  finalColor = vec4(rgb * c.a, c.a);
}`;

export class ToneFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: "rgss-tone" }),
      resources: {
        toneUniforms: {
          uTone: { value: new Float32Array(4), type: "vec4<f32>" },
          uColor: { value: new Float32Array(4), type: "vec4<f32>" },
        },
      },
    });
  }

  set(tone: Tone | null, color: Color | null): void {
    const u = this.resources.toneUniforms.uniforms as { uTone: Float32Array; uColor: Float32Array };
    u.uTone[0] = (tone?.red ?? 0) / 255;
    u.uTone[1] = (tone?.green ?? 0) / 255;
    u.uTone[2] = (tone?.blue ?? 0) / 255;
    u.uTone[3] = (tone?.gray ?? 0) / 255;
    u.uColor[0] = (color?.red ?? 0) / 255;
    u.uColor[1] = (color?.green ?? 0) / 255;
    u.uColor[2] = (color?.blue ?? 0) / 255;
    u.uColor[3] = (color?.alpha ?? 0) / 255;
  }
}
