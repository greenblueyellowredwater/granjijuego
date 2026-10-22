export interface Emote {
  index: number;
  frame: number;
  interval: number;
  fading: boolean;
}

export const EMOTE_TEXTURE = "TileSheets/emotes";

export const startEmote = (index: number): Emote => ({ index, frame: 0, interval: 0, fading: false });

export function updateEmote(e: Emote, ms: number): Emote | null {
  e.interval += ms;
  if (e.fading) {
    if (e.interval > 20) {
      e.interval = 0;
      e.frame--;
      if (e.frame < 0) return null;
    }
    return e;
  }
  if (e.interval > 20 && e.frame <= 3) {
    e.interval = 0;
    e.frame++;
    if (e.frame === 4) e.frame = e.index;
    return e;
  }
  if (e.interval > 250) {
    e.interval = 0;
    e.frame++;
    if (e.frame >= e.index + 4) {
      e.fading = true;
      e.frame = 3;
    }
  }
  return e;
}

export function emoteSourceRect(frame: number, textureWidth = 64) {
  return { sx: (frame * 16) % textureWidth, sy: Math.floor((frame * 16) / textureWidth) * 16, sw: 16, sh: 16 };
}

export function npcEmotePosition(x: number, y: number, offset: { x: number; y: number } | null | undefined, spriteWidth: number, spriteHeight: number, female: boolean, child: boolean) {
  return {
    x: x + (offset?.x ?? 0) + (spriteWidth / 2 - 8) * 4,
    y: y + (offset?.y ?? 0) - (spriteHeight + 3) * 4 + (child ? 32 : female ? 10 : 0),
  };
}
