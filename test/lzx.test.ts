import { describe, expect, it } from "vitest";
import { decompressXnb, isLzxCompressed } from "../tools/lzx.ts";

function xnb(flags: number, body: number[], decompressedSize?: number) {
  const head = [..."XNBw"].map((c) => c.charCodeAt(0));
  head.push(5, flags);
  const extra = decompressedSize === undefined ? [] : [...new Uint8Array(new Uint32Array([decompressedSize]).buffer)];
  const size = head.length + 4 + extra.length + body.length;
  return Buffer.from([...head, ...new Uint8Array(new Uint32Array([size]).buffer), ...extra, ...body]);
}

describe("decompressXnb", () => {
  it("devuelve tal cual los XNB sin comprimir", () => {
    const plain = xnb(0x01, [1, 2, 3]);
    expect(isLzxCompressed(plain)).toBe(false);
    expect(decompressXnb(plain)).toBe(plain);
  });

  it("falla con un código claro si el payload LZX está truncado", () => {
    const broken = xnb(0x81, [0x00, 0x40, 0xaa], 64);
    expect(() => decompressXnb(broken)).toThrow(/LZX falló con código -2/);
  });
});
