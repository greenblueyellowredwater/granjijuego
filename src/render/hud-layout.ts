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
