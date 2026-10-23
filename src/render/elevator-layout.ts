const BORDER = 32;
const SIDE = 16;

export function elevatorLayout(lowestLevel: number, uiWidth: number, uiHeight: number) {
  const count = Math.trunc(Math.min(lowestLevel, 120) / 5);
  const width = count > 50 ? 484 + BORDER * 2 : Math.min(220 + BORDER * 2, count * 44 + BORDER * 2);
  const height = Math.max(64 + BORDER * 3, Math.trunc((count * 44) / (width - BORDER)) * 44 + 64 + BORDER * 3);
  const x = Math.trunc(uiWidth / 2) - Math.trunc(width / 2);
  const y = Math.trunc(uiHeight / 2) - Math.trunc(height / 2);
  const left = x + BORDER + Math.trunc((SIDE * 3) / 4);
  let bx = left, by = y + BORDER + Math.trunc(BORDER / 3);
  const buttons: { level: number; x: number; y: number }[] = [];
  for (let i = 0; i <= count; i++) {
    buttons.push({ level: i * 5, x: bx, y: by });
    bx += 64 - 20;
    if (bx > x + width - BORDER) {
      bx = left;
      by += 44;
    }
  }
  return { x, y, width, height, buttons, close: { x: x + width - 36, y: y - 8 } };
}
