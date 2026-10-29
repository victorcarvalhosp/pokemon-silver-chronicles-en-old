// RGSS Graphics.transition(duration, filename, vague) with a transition
// image: the frozen screen gives way to the new one where the grayscale image
// is darker than the progress, with `vague` levels of softness (as mkxp's
// trans.frag: alpha = (clamp(T, prog, prog + vague) - prog) / vague).
// Applied to the frozen-screen sprite; the map is a sprite stretched over the
// screen, sampled like Pixi's DisplacementFilter samples its map.
import { Filter, GlProgram, Matrix, type FilterSystem, type RenderSurface, type Sprite, type Texture } from "pixi.js";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vMapCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uFilterMatrix;
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
  vMapCoord = (uFilterMatrix * vec3(vTextureCoord, 1.0)).xy;
}`;

const fragment = `
in vec2 vTextureCoord;
in vec2 vMapCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMapTexture;
uniform float uProg;
uniform float uVague;
void main(void) {
  float transV = texture(uMapTexture, clamp(vMapCoord, 0.0, 1.0)).r;
  float cTransV = clamp(transV, uProg, uProg + uVague);
  float alpha = (cTransV - uProg) / uVague;
  finalColor = texture(uTexture, vTextureCoord) * alpha;
}`;

export class TransitionFilter extends Filter {
  constructor(private mapSprite: Sprite) {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: "rgss-transition" }),
      resources: {
        transitionUniforms: {
          uFilterMatrix: { value: new Matrix(), type: "mat3x3<f32>" },
          uProg: { value: 0, type: "f32" },
          uVague: { value: 40 / 256, type: "f32" },
        },
        uMapTexture: mapSprite.texture.source,
      },
    });
    mapSprite.renderable = false;
  }

  /** prog in 0..1; vague in RGSS units (1..256). */
  set(prog: number, vague: number): void {
    const u = this.resources.transitionUniforms.uniforms as { uProg: number; uVague: number };
    u.uProg = prog;
    u.uVague = Math.max(1, Math.min(256, vague)) / 256;
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const u = this.resources.transitionUniforms.uniforms as { uFilterMatrix: Matrix };
    filterManager.calculateSpriteMatrix(u.uFilterMatrix, this.mapSprite);
    this.resources.uMapTexture = this.mapSprite.texture.source;
    filterManager.applyFilter(this, input, output, clearMode);
  }
}
