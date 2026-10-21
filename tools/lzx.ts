import { readFileSync } from "node:fs";

const PROLOGUE = 14;
const HEADER = 10;
const LZX = 0x80;
const LZ4 = 0x40;

interface Exports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  decompress_xnb(src: number, srcLen: number, dst: number, dstLen: number): number;
}

const wasm = new WebAssembly.Instance(
  new WebAssembly.Module(readFileSync(new URL("./wasm/xnb_lzx.wasm", import.meta.url))),
).exports as unknown as Exports;

export function isLzxCompressed(xnb: Uint8Array) {
  return (xnb[5] & LZX) !== 0;
}

export function decompressXnb(xnb: Buffer): Buffer {
  if (!isLzxCompressed(xnb)) return xnb;
  const fileSize = xnb.readUInt32LE(6);
  const size = xnb.readUInt32LE(10);
  const payload = xnb.subarray(PROLOGUE, fileSize);
  const src = wasm.alloc(payload.length);
  const dst = wasm.alloc(size);
  try {
    new Uint8Array(wasm.memory.buffer, src, payload.length).set(payload);
    const code = wasm.decompress_xnb(src, payload.length, dst, size);
    if (code !== 0) throw new Error(`LZX falló con código ${code}`);
    const out = Buffer.allocUnsafe(HEADER + size);
    xnb.copy(out, 0, 0, 6);
    out[5] &= ~(LZX | LZ4);
    out.writeUInt32LE(HEADER + size, 6);
    out.set(new Uint8Array(wasm.memory.buffer, dst, size), HEADER);
    return out;
  } finally {
    wasm.dealloc(src, payload.length);
    wasm.dealloc(dst, size);
  }
}
