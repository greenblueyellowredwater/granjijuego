import Phaser from "phaser";
import { lightmapFill, RAIN_VEIL, type Lighting } from "../world/clock.ts";
import { LIGHT_TEXTURES, LIGHTMAP_SCALE as Q, lightmapSize, lightQuad, type LightSource } from "../world/lights.ts";

export const LIGHTMAP_DEPTH = 90;
const LIGHTMAP_KEY = "lighting:lightmap";

export class LightingOverlay {
  private canvas: Phaser.Textures.CanvasTexture | null = null;
  private image: Phaser.GameObjects.Image | null = null;
  private veil: Phaser.GameObjects.Image | null = null;
  private readonly cutouts = new Map<number, HTMLCanvasElement | null>();
  private readonly blendMode: number;

  constructor(private readonly scene: Phaser.Scene) {
    const renderer = scene.game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const gl = renderer.gl;
      this.blendMode = renderer.addBlendMode([gl.SRC_COLOR, gl.ONE, gl.ZERO, gl.ONE], gl.FUNC_REVERSE_SUBTRACT);
    } else this.blendMode = Phaser.BlendModes.MULTIPLY;
  }

  static textureKeys() {
    return Object.values(LIGHT_TEXTURES);
  }

  private cutout(texture: number) {
    if (this.cutouts.has(texture)) return this.cutouts.get(texture)!;
    const key = LIGHT_TEXTURES[texture];
    let result: HTMLCanvasElement | null = null;
    if (key && this.scene.textures.exists(key)) {
      const src = this.scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      result = document.createElement("canvas");
      result.width = src.width;
      result.height = src.height;
      const ctx = result.getContext("2d")!;
      ctx.drawImage(src, 0, 0);
      const data = ctx.getImageData(0, 0, src.width, src.height);
      for (let i = 0; i < data.data.length; i += 4) data.data[i] = data.data[i + 1] = data.data[i + 2] = 0;
      ctx.putImageData(data, 0, 0);
    }
    this.cutouts.set(texture, result);
    return result;
  }

  private ensure(width: number, height: number) {
    const size = lightmapSize(width, height);
    if (this.canvas && this.canvas.width === size.width && this.canvas.height === size.height) return this.canvas;
    if (this.scene.textures.exists(LIGHTMAP_KEY)) this.scene.textures.remove(LIGHTMAP_KEY);
    this.canvas = this.scene.textures.createCanvas(LIGHTMAP_KEY, size.width, size.height)!;
    this.canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
    if (!this.image) {
      this.image = this.scene.add.image(0, 0, LIGHTMAP_KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(LIGHTMAP_DEPTH).setBlendMode(this.blendMode);
    } else this.image.setTexture(LIGHTMAP_KEY);
    this.image.setScale(Q);
    return this.canvas;
  }

  private drawVeil(visible: boolean, camera: Phaser.Cameras.Scene2D.Camera) {
    if (!visible) {
      this.veil?.setVisible(false);
      return;
    }
    this.veil ??= this.scene.add.image(0, 0, "__WHITE").setOrigin(0, 0).setScrollFactor(0).setDepth(LIGHTMAP_DEPTH + 0.1).setBlendMode(this.blendMode);
    const [r, g, b] = RAIN_VEIL;
    this.veil.setDisplaySize(camera.width, camera.height).setTint((r << 16) | (g << 8) | b).setVisible(true);
  }

  draw(lighting: Lighting, lights: LightSource[], camera: Phaser.Cameras.Scene2D.Camera, rainVeil = false) {
    this.drawVeil(lighting.draw && rainVeil, camera);
    if (!lighting.draw) {
      this.image?.setVisible(false);
      return;
    }
    const canvas = this.ensure(camera.width, camera.height);
    const ctx = canvas.getContext();
    const [r, g, b] = lightmapFill(lighting.fill);
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    for (const l of lights) {
      if (l.color[3] <= 0) continue;
      const cut = this.cutout(l.texture);
      if (!cut) continue;
      const q = lightQuad(l, cut, Math.round(camera.scrollX), Math.round(camera.scrollY));
      if (q.x > canvas.width || q.y > canvas.height || q.x + q.w < 0 || q.y + q.h < 0) continue;
      ctx.globalAlpha = q.alpha;
      ctx.drawImage(cut, q.x, q.y, q.w, q.h);
    }
    ctx.globalAlpha = 1;
    canvas.refresh();
    this.image!.setVisible(true);
  }
}
