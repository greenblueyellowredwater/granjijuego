export function dateText(dayOfMonth: number, shortDays: string[]) {
  return `${shortDays[dayOfMonth % 7] ?? ""}. ${dayOfMonth}`;
}

export function moneyDigits(value: number, numDigits = 8) {
  const out: { index: number; digit: number }[] = [];
  let divisor = 10 ** (numDigits - 1), started = false;
  for (let i = 0; i < numDigits; i++) {
    const digit = Math.trunc(value / divisor) % 10;
    if (digit > 0 || i === numDigits - 1) started = true;
    if (started) out.push({ index: i, digit });
    divisor = Math.trunc(divisor / 10);
  }
  return out;
}

export function redToGreen(p: number): [number, number, number] {
  const r = p > 0.5 ? Math.trunc((1 - p) * 2 * 255) : 255;
  const g = Math.trunc(Math.min(255, p * 2 * 255));
  return [r, g, 0];
}

export function energyBarLayout(stamina: number, maxStamina: number, uiWidth: number, uiHeight: number) {
  const k = 0.625;
  const x = uiWidth - 48 - 8;
  const y = uiHeight - 224 - 16 - Math.trunc((maxStamina - 270) * k);
  const fillHeight = Math.trunc(stamina * k) - 1;
  return {
    top: { x, y },
    middle: { x, y: y + 64, w: 48, h: uiHeight - 64 - 16 - Math.trunc(y + 64 - 8) },
    bottom: { x, y: y + 224 + Math.trunc((maxStamina - 270) * k) - 64 },
    fill: { x: x + 12, y: y + 16 + 32 + Math.trunc(maxStamina * k) - Math.trunc(Math.max(0, stamina) * k), w: 24, h: fillHeight },
    color: redToGreen(stamina / maxStamina),
  };
}
