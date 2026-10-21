import { readFileSync } from "node:fs";

const TABLES = [
  "Module", "TypeRef", "TypeDef", "FieldPtr", "Field", "MethodPtr", "MethodDef", "ParamPtr", "Param",
  "InterfaceImpl", "MemberRef", "Constant", "CustomAttribute", "FieldMarshal", "DeclSecurity",
  "ClassLayout", "FieldLayout", "StandAloneSig", "EventMap", "EventPtr", "Event", "PropertyMap",
  "PropertyPtr", "Property", "MethodSemantics", "MethodImpl", "ModuleRef", "TypeSpec", "ImplMap",
  "FieldRVA", "EncLog", "EncMap", "Assembly", "AssemblyProcessor", "AssemblyOS", "AssemblyRef",
  "AssemblyRefProcessor", "AssemblyRefOS", "File", "ExportedType", "ManifestResource",
  "NestedClass", "GenericParam", "MethodSpec", "GenericParamConstraint",
] as const;

type TableName = (typeof TABLES)[number];

const CODED: Record<string, [number, (TableName | "")[]]> = {
  TypeDefOrRef: [2, ["TypeDef", "TypeRef", "TypeSpec"]],
  HasConstant: [2, ["Field", "Param", "Property"]],
  HasCustomAttribute: [5, ["MethodDef", "Field", "TypeRef", "TypeDef", "Param", "InterfaceImpl", "MemberRef", "Module", "DeclSecurity", "Property", "Event", "StandAloneSig", "ModuleRef", "TypeSpec", "Assembly", "AssemblyRef", "File", "ExportedType", "ManifestResource", "GenericParam", "GenericParamConstraint", "MethodSpec"]],
  HasFieldMarshal: [1, ["Field", "Param"]],
  HasDeclSecurity: [2, ["TypeDef", "MethodDef", "Assembly"]],
  MemberRefParent: [3, ["TypeDef", "TypeRef", "ModuleRef", "MethodDef", "TypeSpec"]],
  HasSemantics: [1, ["Event", "Property"]],
  MethodDefOrRef: [1, ["MethodDef", "MemberRef"]],
  MemberForwarded: [1, ["Field", "MethodDef"]],
  Implementation: [2, ["File", "AssemblyRef", "ExportedType"]],
  CustomAttributeType: [3, ["", "", "MethodDef", "MemberRef", ""]],
  ResolutionScope: [2, ["Module", "ModuleRef", "AssemblyRef", "TypeRef"]],
  TypeOrMethodDef: [1, ["TypeDef", "MethodDef"]],
};

const SCHEMA: Record<TableName, string[]> = {
  Module: ["2", "S", "G", "G", "G"],
  TypeRef: ["ResolutionScope", "S", "S"],
  TypeDef: ["4", "S", "S", "TypeDefOrRef", "Field", "MethodDef"],
  FieldPtr: ["Field"],
  Field: ["2", "S", "B"],
  MethodPtr: ["MethodDef"],
  MethodDef: ["4", "2", "2", "S", "B", "Param"],
  ParamPtr: ["Param"],
  Param: ["2", "2", "S"],
  InterfaceImpl: ["TypeDef", "TypeDefOrRef"],
  MemberRef: ["MemberRefParent", "S", "B"],
  Constant: ["2", "HasConstant", "B"],
  CustomAttribute: ["HasCustomAttribute", "CustomAttributeType", "B"],
  FieldMarshal: ["HasFieldMarshal", "B"],
  DeclSecurity: ["2", "HasDeclSecurity", "B"],
  ClassLayout: ["2", "4", "TypeDef"],
  FieldLayout: ["4", "Field"],
  StandAloneSig: ["B"],
  EventMap: ["TypeDef", "Event"],
  EventPtr: ["Event"],
  Event: ["2", "S", "TypeDefOrRef"],
  PropertyMap: ["TypeDef", "Property"],
  PropertyPtr: ["Property"],
  Property: ["2", "S", "B"],
  MethodSemantics: ["2", "MethodDef", "HasSemantics"],
  MethodImpl: ["TypeDef", "MethodDefOrRef", "MethodDefOrRef"],
  ModuleRef: ["S"],
  TypeSpec: ["B"],
  ImplMap: ["2", "MemberForwarded", "S", "ModuleRef"],
  FieldRVA: ["4", "Field"],
  EncLog: ["4", "4"],
  EncMap: ["4"],
  Assembly: ["4", "2", "2", "2", "2", "4", "B", "S", "S"],
  AssemblyProcessor: ["4"],
  AssemblyOS: ["4", "4", "4"],
  AssemblyRef: ["2", "2", "2", "2", "4", "B", "S", "S", "B"],
  AssemblyRefProcessor: ["4", "AssemblyRef"],
  AssemblyRefOS: ["4", "4", "4", "AssemblyRef"],
  File: ["4", "S", "B"],
  ExportedType: ["4", "4", "S", "S", "Implementation"],
  ManifestResource: ["4", "4", "S", "Implementation"],
  NestedClass: ["TypeDef", "TypeDef"],
  GenericParam: ["2", "2", "TypeOrMethodDef", "S"],
  MethodSpec: ["MethodDefOrRef", "B"],
  GenericParamConstraint: ["GenericParam", "TypeDefOrRef"],
};

export type SigType =
  | { k: "prim"; n: string }
  | { k: "value" | "class"; n: string }
  | { k: "array"; of: SigType }
  | { k: "generic"; n: string; args: SigType[] }
  | { k: "unknown"; e: number };

const PRIM: Record<number, string> = {
  0x02: "Boolean", 0x03: "Char", 0x04: "SByte", 0x05: "Byte", 0x06: "Int16", 0x07: "UInt16",
  0x08: "Int32", 0x09: "UInt32", 0x0a: "Int64", 0x0b: "UInt64", 0x0c: "Single", 0x0d: "Double",
  0x0e: "String", 0x1c: "Object",
};

export class Metadata {
  readonly tables = {} as Record<TableName, number[][]>;
  private readonly b: Buffer;
  private readonly sections: { va: number; vs: number; raw: number; rs: number }[] = [];
  private readonly streams = new Map<string, { off: number; size: number }>();
  private readonly nestedIn = new Map<number, number>();

  constructor(path: string) {
    const b = (this.b = readFileSync(path));
    const pe = b.readUInt32LE(0x3c);
    const nsec = b.readUInt16LE(pe + 6);
    const optSize = b.readUInt16LE(pe + 20);
    const opt = pe + 24;
    const dataDirs = opt + (b.readUInt16LE(opt) === 0x10b ? 96 : 112);
    for (let i = 0; i < nsec; i++) {
      const s = opt + optSize + i * 40;
      this.sections.push({ va: b.readUInt32LE(s + 12), vs: b.readUInt32LE(s + 8), raw: b.readUInt32LE(s + 20), rs: b.readUInt32LE(s + 16) });
    }
    const cli = this.offset(b.readUInt32LE(dataDirs + 14 * 8));
    const md = this.offset(b.readUInt32LE(cli + 8));
    let p = md + 16 + b.readUInt32LE(md + 12) + 2;
    const count = b.readUInt16LE(p);
    p += 2;
    for (let i = 0; i < count; i++) {
      const off = b.readUInt32LE(p), size = b.readUInt32LE(p + 4);
      p += 8;
      const end = b.indexOf(0, p);
      const name = b.toString("latin1", p, end);
      p = (end + 4) & ~3;
      this.streams.set(name, { off: md + off, size });
    }
    this.readTables();
    for (const [nested, enclosing] of this.tables.NestedClass) this.nestedIn.set(nested, enclosing);
  }

  private offset(rva: number) {
    for (const s of this.sections) if (rva >= s.va && rva < s.va + Math.max(s.vs, s.rs)) return rva - s.va + s.raw;
    throw new Error(`RVA fuera de secciones: 0x${rva.toString(16)}`);
  }

  private readTables() {
    const b = this.b;
    const ts = this.streams.get("#~") ?? this.streams.get("#-");
    if (!ts) throw new Error("Sin stream de tablas");
    const heapSizes = b[ts.off + 6];
    const valid = b.readBigUInt64LE(ts.off + 8);
    let p = ts.off + 24;
    const rows = {} as Record<TableName, number>;
    TABLES.forEach((t, i) => {
      if ((valid >> BigInt(i)) & 1n) {
        rows[t] = b.readUInt32LE(p);
        p += 4;
      } else rows[t] = 0;
    });
    const sw = heapSizes & 1 ? 4 : 2, gw = heapSizes & 2 ? 4 : 2, bw = heapSizes & 4 ? 4 : 2;
    const width = (c: string): number => {
      if (c === "2") return 2;
      if (c === "4") return 4;
      if (c === "S") return sw;
      if (c === "G") return gw;
      if (c === "B") return bw;
      if (c in CODED) {
        const [bits, tabs] = CODED[c];
        const max = Math.max(...tabs.map((t) => (t ? rows[t] : 0)));
        return max < 1 << (16 - bits) ? 2 : 4;
      }
      return rows[c as TableName] < 65536 ? 2 : 4;
    };
    for (const t of TABLES) {
      const ws = SCHEMA[t].map(width);
      const data: number[][] = [];
      for (let r = 0; r < rows[t]; r++) {
        const row: number[] = [];
        for (const w of ws) {
          row.push(w === 2 ? b.readUInt16LE(p) : b.readUInt32LE(p));
          p += w;
        }
        data.push(row);
      }
      this.tables[t] = data;
    }
  }

  string(i: number) {
    const o = this.streams.get("#Strings")!.off + i;
    return this.b.toString("utf8", o, this.b.indexOf(0, o));
  }

  blob(i: number) {
    let o = this.streams.get("#Blob")!.off + i;
    const x = this.b[o];
    let n: number;
    if ((x & 0x80) === 0) {
      n = x;
      o += 1;
    } else if ((x & 0xc0) === 0x80) {
      n = ((x & 0x3f) << 8) | this.b[o + 1];
      o += 2;
    } else {
      n = ((x & 0x1f) << 24) | (this.b[o + 1] << 16) | (this.b[o + 2] << 8) | this.b[o + 3];
      o += 4;
    }
    return this.b.subarray(o, o + n);
  }

  typeDefName(i: number): string {
    const r = this.tables.TypeDef[i - 1];
    const name = this.string(r[1]);
    const enclosing = this.nestedIn.get(i);
    if (enclosing) return `${this.typeDefName(enclosing)}/${name}`;
    const ns = this.string(r[2]);
    return ns ? `${ns}.${name}` : name;
  }

  typeRefName(i: number) {
    const r = this.tables.TypeRef[i - 1];
    const ns = this.string(r[2]);
    return ns ? `${ns}.${this.string(r[1])}` : this.string(r[1]);
  }

  typeDefOrRef(coded: number) {
    const tag = coded & 3, idx = coded >> 2;
    if (idx === 0) return null;
    if (tag === 0) return this.typeDefName(idx);
    if (tag === 1) return this.typeRefName(idx);
    return "<TypeSpec>";
  }

  memberRange(table: "Field" | "MethodDef" | "Property", typeIndex: number) {
    if (table === "Property") {
      const maps = this.tables.PropertyMap;
      const k = maps.findIndex((m) => m[0] === typeIndex);
      if (k < 0) return [];
      const end = k + 1 < maps.length ? maps[k + 1][1] : this.tables.Property.length + 1;
      return range(maps[k][1], end);
    }
    const col = table === "Field" ? 4 : 5;
    const td = this.tables.TypeDef;
    const end = typeIndex < td.length ? td[typeIndex][col] : this.tables[table].length + 1;
    return range(td[typeIndex - 1][col], end);
  }

  decodeType(sig: Buffer, pos: number): [SigType, number] {
    const e = sig[pos++];
    if (e in PRIM) return [{ k: "prim", n: PRIM[e] }, pos];
    if (e === 0x11 || e === 0x12) {
      const [v, p] = compressed(sig, pos);
      return [{ k: e === 0x11 ? "value" : "class", n: this.typeDefOrRef(v) ?? "?" }, p];
    }
    if (e === 0x1d) {
      const [of, p] = this.decodeType(sig, pos);
      return [{ k: "array", of }, p];
    }
    if (e === 0x15) {
      pos++;
      const [v, p1] = compressed(sig, pos);
      let [n, p] = compressed(sig, p1);
      const args: SigType[] = [];
      while (n-- > 0) {
        const [a, q] = this.decodeType(sig, p);
        args.push(a);
        p = q;
      }
      return [{ k: "generic", n: this.typeDefOrRef(v) ?? "?", args }, p];
    }
    return [{ k: "unknown", e }, pos];
  }

  attributeNames(tag: number, index: number) {
    let cache = this.attrCache;
    if (!cache) {
      cache = this.attrCache = new Map();
      for (const [parent, ctor] of this.tables.CustomAttribute) {
        if ((ctor & 7) !== 3) continue;
        const owner = this.tables.MemberRef[(ctor >> 3) - 1][0];
        if ((owner & 7) !== 1) continue;
        const key = `${parent & 31}:${parent >> 5}`;
        const name = this.typeRefName(owner >> 3).split(".").pop()!;
        cache.set(key, [...(cache.get(key) ?? []), name]);
      }
    }
    return cache.get(`${tag}:${index}`) ?? [];
  }
  private attrCache?: Map<string, string[]>;
}

function range(a: number, b: number) {
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
}

function compressed(s: Buffer, p: number): [number, number] {
  const x = s[p];
  if ((x & 0x80) === 0) return [x, p + 1];
  if ((x & 0xc0) === 0x80) return [((x & 0x3f) << 8) | s[p + 1], p + 2];
  return [((x & 0x1f) << 24) | (s[p + 1] << 16) | (s[p + 2] << 8) | s[p + 3], p + 4];
}
