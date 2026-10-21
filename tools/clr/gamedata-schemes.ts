import { Metadata, type SigType } from "./metadata.ts";

export type SchemeEntry = string | SchemeEntry[] | { [k: string]: SchemeEntry };
export interface GeneratedSchemes {
  schemes: Record<string, Record<string, SchemeEntry>>;
  enums: string[];
}

const ATTR_PROPERTY = 9;
const ATTR_FIELD = 1;
const SEM_SETTER = 1;
const SEM_GETTER = 2;
const COLLECTIONS = new Set(["System.Collections.Generic.List`1", "System.Collections.Generic.Dictionary`2"]);

export function generateGameDataSchemes(dllPath: string): GeneratedSchemes {
  const md = new Metadata(dllPath);
  const { TypeDef, Field, Property, MethodDef, MethodSemantics } = md.tables;

  const enums = new Set<string>();
  TypeDef.forEach((r, i) => {
    if (md.typeDefOrRef(r[3]) === "System.Enum") enums.add(md.typeDefName(i + 1));
  });

  const accessors = new Map<number, Map<number, number>>();
  for (const [flags, method, assoc] of MethodSemantics) {
    if ((assoc & 1) === 0) continue;
    const prop = assoc >> 1;
    if (!accessors.has(prop)) accessors.set(prop, new Map());
    accessors.get(prop)!.set(flags, MethodDef[method - 1][2]);
  }

  const toEntry = (t: SigType): SchemeEntry => {
    switch (t.k) {
      case "prim":
        return t.n;
      case "value":
      case "class":
        if (enums.has(t.n)) return "Int32";
        if (t.n.startsWith("Microsoft.Xna.Framework.")) return t.n.split(".").pop()!;
        return t.n.replace("/", ".");
      case "array":
        return `Array<${toEntry(t.of)}>`;
      case "generic":
        if (t.n === "System.Collections.Generic.List`1") return [toEntry(t.args[0])];
        if (t.n === "System.Collections.Generic.Dictionary`2") return { [toEntry(t.args[0]) as string]: toEntry(t.args[1]) };
        if (t.n === "System.Nullable`1") return toEntry(t.args[0]);
        throw new Error(`Genérico no soportado: ${t.n}`);
      default:
        throw new Error(`Tipo de firma no soportado: 0x${t.e.toString(16)}`);
    }
  };

  const nullable = (t: SigType) =>
    t.k === "class" || t.k === "array" || (t.k === "prim" && (t.n === "String" || t.n === "Object")) || (t.k === "generic");

  const members = (typeIndex: number): [string, SigType][] => {
    const row = TypeDef[typeIndex - 1];
    const out: [string, SigType][] = [];
    const base = row[3];
    if (base >> 2 && (base & 3) === 0) out.push(...members(base >> 2));
    for (const p of md.memberRange("Property", typeIndex)) {
      const attrs = md.attributeNames(ATTR_PROPERTY, p);
      if (attrs.includes("ContentSerializerIgnoreAttribute")) continue;
      const acc = accessors.get(p);
      const getter = acc?.get(SEM_GETTER);
      if (getter === undefined) continue;
      const [type] = md.decodeType(md.blob(Property[p - 1][2]), 2);
      if (!attrs.includes("ContentSerializerAttribute")) {
        if ((getter & 7) !== 6) continue;
        if (!acc!.has(SEM_SETTER) && !(type.k === "generic" && COLLECTIONS.has(type.n))) continue;
      }
      out.push([md.string(Property[p - 1][1]), type]);
    }
    for (const f of md.memberRange("Field", typeIndex)) {
      const [flags, name, sig] = Field[f - 1];
      if (flags & 0x10) continue;
      const attrs = md.attributeNames(ATTR_FIELD, f);
      if (attrs.includes("ContentSerializerIgnoreAttribute")) continue;
      if (!attrs.includes("ContentSerializerAttribute") && ((flags & 7) !== 6 || flags & 0x20)) continue;
      const [type] = md.decodeType(md.blob(sig), 1);
      out.push([md.string(name), type]);
    }
    return out;
  };

  const schemes: GeneratedSchemes["schemes"] = {};
  TypeDef.forEach((r, i) => {
    const name = md.typeDefName(i + 1);
    if (enums.has(name) || r[0] & 0x20 || name.includes("<") || !name.includes(".")) return;
    const scheme: Record<string, SchemeEntry> = {};
    for (const [field, type] of members(i + 1)) {
      const isNullableValue = type.k === "generic" && type.n === "System.Nullable`1";
      scheme[isNullableValue || nullable(type) ? `$${field}` : field] = toEntry(type);
    }
    schemes[name.replace("/", ".")] = scheme;
  });

  return { schemes, enums: [...enums] };
}
