declare module "xnb/dist/core/xnb-core.module.js" {
  export function setReaders(readers: Record<string, unknown>): void;
  export function addSchemes(schemes: Record<string, unknown>): void;
  export function addEnum(enums: string[]): void;
  export function bufferToXnb(buffer: ArrayBuffer): unknown;
}
declare module "xnb/dist/readers/xnb-readers.module.js" {
  export class BaseReader {
    isValueType(): boolean;
  }
}
