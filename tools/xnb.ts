import { setReaders, addSchemes, addEnum, bufferToXnb } from "xnb/dist/core/xnb-core.module.js";
import * as Readers from "xnb/dist/readers/xnb-readers.module.js";
import type { GeneratedSchemes } from "./clr/gamedata-schemes.ts";

const { default: _d, ...readerClasses } = Readers as Record<string, unknown>;

class ObjectReader extends Readers.BaseReader {
  static isTypeOf(type: string) {
    return type === "System.Object";
  }
  static type() {
    return "Object";
  }
  isValueType() {
    return false;
  }
  get type() {
    return "Object";
  }
}

export function configureXnb(generated: GeneratedSchemes) {
  setReaders({ ...readerClasses, ObjectReader });
  addSchemes(generated.schemes);
  addEnum(generated.enums);
  console.info = () => {};
  console.log = () => {};
  console.warn = () => {};
}

export function readXnb(buf: Buffer) {
  return bufferToXnb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer) as { content: any };
}
