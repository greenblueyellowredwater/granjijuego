import Phaser from "phaser";
import type { AnimFrame } from "../world/farmer-animation.ts";
import {
  farmerLayers,
  pantsInfo,
  recolorBase,
  shirtInfo,
  type Appearance,
  type ClothingData,
  type FarmerLayer,
  type Pixels,
  type RGBA,
} from "../world/farmer-appearance.ts";
import type { Facing } from "../world/movement.ts";

const SCALE = 4;
const LAYER_STEP = 1e-8;

export function farmerTextureKeys(a: Appearance) {
  return {
    base: a.isMale ? "Characters/Farmer/farmer_base" : "Characters/Farmer/farmer_girl_base",
    pants: "Characters/Farmer/pants",
    shirts: "Characters/Farmer/shirts",
    hair: "Characters/Farmer/hairstyles",
    skinColors: "Characters/Farmer/skinColors",
    shoeColors: "Characters/Farmer/shoeColors",
  };
}

const toTint = (c: RGBA | null) => (c ? (c[0] << 16) | (c[1] << 8) | c[2] : 0xffffff);

function readPixels(scene: Phaser.Scene, key: string): Pixels {
  const img = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
}

export class FarmerSprite {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly textureFor: Record<FarmerLayer["texture"], string>;
  private readonly shirt: ReturnType<typeof shirtInfo>;
  private readonly pants: ReturnType<typeof pantsInfo>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly appearance: Appearance,
    clothing: ClothingData,
    private readonly featureX: number[],
    private readonly featureY: number[],
  ) {
    const keys = farmerTextureKeys(appearance);
    this.shirt = shirtInfo(appearance, clothing);
    this.pants = pantsInfo(appearance, clothing);
    const recolored = `farmer:recolored:${JSON.stringify(appearance)}`;
    if (!scene.textures.exists(recolored)) {
      const base = readPixels(scene, keys.base);
      const data = recolorBase(
        base,
        { skinColors: readPixels(scene, keys.skinColors), shoeColors: readPixels(scene, keys.shoeColors), shirts: readPixels(scene, keys.shirts) },
        appearance,
        this.shirt,
      );
      const canvas = scene.textures.createCanvas(recolored, base.width, base.height)!;
      const ctx = canvas.getContext();
      ctx.putImageData(new ImageData(data, base.width, base.height), 0, 0);
      canvas.refresh();
    }
    this.textureFor = { base: recolored, pants: keys.pants, shirts: keys.shirts, hair: keys.hair };
    for (let i = 0; i < 6; i++) this.images.push(scene.add.image(0, 0, recolored).setOrigin(0, 0).setScale(SCALE));
  }

  private frame(texture: string, l: FarmerLayer) {
    const tex = this.scene.textures.get(texture);
    const name = `${l.sx},${l.sy},${l.sw},${l.sh}`;
    if (!tex.has(name)) tex.add(name, 0, l.sx, l.sy, l.sw, l.sh);
    return name;
  }

  update(f: AnimFrame, facing: Facing, x: number, y: number, depth: number) {
    const feature = { x: this.featureX[f.frame] ?? 0, y: this.featureY[f.frame] ?? 0 };
    const layers = farmerLayers(this.appearance, f.frame, f.flip, facing, feature, this.shirt, this.pants);
    layers.forEach((l, i) => {
      const img = this.images[i];
      const texture = this.textureFor[l.texture];
      if (!this.scene.textures.exists(texture)) {
        img.setVisible(false);
        return;
      }
      img
        .setTexture(texture, this.frame(texture, l))
        .setPosition(x + l.dx * SCALE, y + l.dy * SCALE)
        .setFlipX(l.flip)
        .setTint(toTint(l.tint))
        .setDepth(depth + l.order * LAYER_STEP)
        .setVisible(true);
    });
  }
}
