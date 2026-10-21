import { Metadata } from "./metadata.ts";

type Operand = "none" | "i8" | "u8" | "i32" | "i64" | "r4" | "r8" | "tok" | "br8" | "br32" | "switch" | "u16";

const ONE: Record<number, [string, Operand]> = {};
const TWO: Record<number, [string, Operand]> = {};

function def(table: Record<number, [string, Operand]>, start: number, names: string, operand: Operand = "none") {
  names.split(" ").forEach((n, i) => (table[start + i] = [n, operand]));
}

def(ONE, 0x00, "nop break ldarg.0 ldarg.1 ldarg.2 ldarg.3 ldloc.0 ldloc.1 ldloc.2 ldloc.3 stloc.0 stloc.1 stloc.2 stloc.3");
def(ONE, 0x0e, "ldarg.s ldarga.s starg.s ldloc.s ldloca.s stloc.s", "u8");
def(ONE, 0x14, "ldnull ldc.i4.m1 ldc.i4.0 ldc.i4.1 ldc.i4.2 ldc.i4.3 ldc.i4.4 ldc.i4.5 ldc.i4.6 ldc.i4.7 ldc.i4.8");
def(ONE, 0x1f, "ldc.i4.s", "i8");
def(ONE, 0x20, "ldc.i4", "i32");
def(ONE, 0x21, "ldc.i8", "i64");
def(ONE, 0x22, "ldc.r4", "r4");
def(ONE, 0x23, "ldc.r8", "r8");
def(ONE, 0x25, "dup pop");
def(ONE, 0x27, "jmp call calli", "tok");
def(ONE, 0x2a, "ret");
def(ONE, 0x2b, "br.s brfalse.s brtrue.s beq.s bge.s bgt.s ble.s blt.s bne.un.s bge.un.s bgt.un.s ble.un.s blt.un.s", "br8");
def(ONE, 0x38, "br brfalse brtrue beq bge bgt ble blt bne.un bge.un bgt.un ble.un blt.un", "br32");
def(ONE, 0x45, "switch", "switch");
def(ONE, 0x46, "ldind.i1 ldind.u1 ldind.i2 ldind.u2 ldind.i4 ldind.u4 ldind.i8 ldind.i ldind.r4 ldind.r8 ldind.ref stind.ref stind.i1 stind.i2 stind.i4 stind.i8 stind.r4 stind.r8 add sub mul div div.un rem rem.un and or xor shl shr shr.un neg not conv.i1 conv.i2 conv.i4 conv.i8 conv.r4 conv.r8 conv.u4 conv.u8");
def(ONE, 0x6f, "callvirt cpobj ldobj ldstr newobj castclass isinst", "tok");
def(ONE, 0x76, "conv.r.un");
def(ONE, 0x79, "unbox", "tok");
def(ONE, 0x7a, "throw");
def(ONE, 0x7b, "ldfld ldflda stfld ldsfld ldsflda stsfld stobj", "tok");
def(ONE, 0x82, "conv.ovf.i1.un conv.ovf.i2.un conv.ovf.i4.un conv.ovf.i8.un conv.ovf.u1.un conv.ovf.u2.un conv.ovf.u4.un conv.ovf.u8.un conv.ovf.i.un conv.ovf.u.un");
def(ONE, 0x8c, "box newarr", "tok");
def(ONE, 0x8e, "ldlen");
def(ONE, 0x8f, "ldelema", "tok");
def(ONE, 0x90, "ldelem.i1 ldelem.u1 ldelem.i2 ldelem.u2 ldelem.i4 ldelem.u4 ldelem.i8 ldelem.i ldelem.r4 ldelem.r8 ldelem.ref stelem.i stelem.i1 stelem.i2 stelem.i4 stelem.i8 stelem.r4 stelem.r8 stelem.ref");
def(ONE, 0xa3, "ldelem stelem unbox.any", "tok");
def(ONE, 0xb3, "conv.ovf.i1 conv.ovf.u1 conv.ovf.i2 conv.ovf.u2 conv.ovf.i4 conv.ovf.u4 conv.ovf.i8 conv.ovf.u8");
def(ONE, 0xc2, "refanyval", "tok");
def(ONE, 0xc3, "ckfinite");
def(ONE, 0xc6, "mkrefany", "tok");
def(ONE, 0xd0, "ldtoken", "tok");
def(ONE, 0xd1, "conv.u2 conv.u1 conv.i conv.ovf.i conv.ovf.u add.ovf add.ovf.un mul.ovf mul.ovf.un sub.ovf sub.ovf.un endfinally");
def(ONE, 0xdd, "leave", "br32");
def(ONE, 0xde, "leave.s", "br8");
def(ONE, 0xdf, "stind.i conv.u");
def(TWO, 0x00, "arglist ceq cgt cgt.un clt clt.un");
def(TWO, 0x06, "ldftn ldvirtftn", "tok");
def(TWO, 0x09, "ldarg ldarga starg ldloc ldloca stloc", "u16");
def(TWO, 0x0f, "localloc");
def(TWO, 0x11, "endfilter");
def(TWO, 0x12, "unaligned.", "u8");
def(TWO, 0x13, "volatile. tail.");
def(TWO, 0x15, "initobj constrained.", "tok");
def(TWO, 0x17, "cpblk initblk");
def(TWO, 0x19, "no.", "u8");
def(TWO, 0x1a, "rethrow");
def(TWO, 0x1c, "sizeof", "tok");
def(TWO, 0x1d, "refanytype readonly.");

export class Disassembler {
  private readonly md: any;
  private readonly owner = new Map<number, number>();

  constructor(dll: string) {
    this.md = new Metadata(dll);
    this.md.tables.TypeDef.forEach((_: unknown, i: number) => {
      for (const m of this.md.memberRange("MethodDef", i + 1)) this.owner.set(m, i + 1);
    });
  }

  methodName(index: number) {
    return `${this.md.typeDefName(this.owner.get(index))}::${this.md.string(this.md.tables.MethodDef[index - 1][3])}`;
  }

  allMethods() {
    return this.md.tables.MethodDef.map((_: unknown, i: number) => i + 1) as number[];
  }

  findMethods(fullName: string) {
    const out: number[] = [];
    this.md.tables.MethodDef.forEach((_: unknown, i: number) => {
      const name = this.methodName(i + 1);
      if (fullName.endsWith("::*") ? name.startsWith(fullName.slice(0, -1)) : name === fullName) out.push(i + 1);
    });
    return out;
  }

  private userString(i: number) {
    const b: Buffer = this.md.b;
    let o = this.md.streams.get("#US").off + i;
    const x = b[o];
    let n: number;
    if ((x & 0x80) === 0) [n, o] = [x, o + 1];
    else if ((x & 0xc0) === 0x80) [n, o] = [((x & 0x3f) << 8) | b[o + 1], o + 2];
    else [n, o] = [((x & 0x1f) << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3], o + 4];
    return b.toString("utf16le", o, o + n - 1);
  }

  private parentName(coded: number) {
    const tag = coded & 7, idx = coded >> 3;
    if (tag === 0) return this.md.typeDefName(idx);
    if (tag === 1) return this.md.typeRefName(idx);
    if (tag === 3) return this.methodName(idx);
    if (tag === 4) return this.typeSpecName(idx);
    return "?";
  }

  private typeSpecName(idx: number) {
    try {
      const [t] = this.md.decodeType(this.md.blob(this.md.tables.TypeSpec[idx - 1][0]), 0);
      const fmt = (x: any): string => (x.k === "generic" ? `${x.n}<${x.args.map(fmt).join(",")}>` : x.n ?? x.k);
      return fmt(t);
    } catch {
      return "spec";
    }
  }

  token(tok: number): string {
    const table = tok >>> 24, idx = tok & 0xffffff;
    const t = this.md.tables;
    switch (table) {
      case 0x70:
        return JSON.stringify(this.userString(idx));
      case 0x06:
        return this.methodName(idx);
      case 0x04: {
        const owner = t.TypeDef.findIndex((_: unknown, i: number) => this.md.memberRange("Field", i + 1).includes(idx));
        return `${owner >= 0 ? this.md.typeDefName(owner + 1) : "?"}::${this.md.string(t.Field[idx - 1][1])}`;
      }
      case 0x0a:
        return `${this.parentName(t.MemberRef[idx - 1][0])}::${this.md.string(t.MemberRef[idx - 1][1])}`;
      case 0x01:
        return this.md.typeRefName(idx);
      case 0x02:
        return this.md.typeDefName(idx);
      case 0x1b:
        return this.typeSpecName(idx);
      case 0x2b: {
        const m = t.MethodSpec[idx - 1][0];
        return `${m & 1 ? this.token(0x0a000000 | (m >> 1)) : this.methodName(m >> 1)}<…>`;
      }
      default:
        return `0x${tok.toString(16)}`;
    }
  }

  disassemble(index: number) {
    const rva = this.md.tables.MethodDef[index - 1][0];
    if (!rva) return [`// ${this.methodName(index)}: sin cuerpo`];
    const b: Buffer = this.md.b;
    const o = this.md.offset(rva);
    let size: number, code: number;
    if ((b[o] & 3) === 2) [size, code] = [b[o] >> 2, o + 1];
    else [size, code] = [b.readUInt32LE(o + 4), o + (b.readUInt16LE(o) >> 12) * 4];
    const lines = [`// ${this.methodName(index)} (${size} bytes IL)`];
    let p = 0;
    while (p < size) {
      const at = p;
      let op = b[code + p++];
      let entry = ONE[op];
      if (op === 0xfe) {
        op = b[code + p++];
        entry = TWO[op];
      }
      if (!entry) {
        lines.push(`IL_${at.toString(16).padStart(4, "0")}: ??? 0x${op.toString(16)}`);
        continue;
      }
      const [name, kind] = entry;
      let arg = "";
      const r = code + p;
      switch (kind) {
        case "i8": arg = String(b.readInt8(r)); p += 1; break;
        case "u8": arg = String(b[r]); p += 1; break;
        case "u16": arg = String(b.readUInt16LE(r)); p += 2; break;
        case "i32": arg = String(b.readInt32LE(r)); p += 4; break;
        case "i64": arg = String(b.readBigInt64LE(r)); p += 8; break;
        case "r4": arg = String(b.readFloatLE(r)); p += 4; break;
        case "r8": arg = String(b.readDoubleLE(r)); p += 8; break;
        case "tok": arg = this.token(b.readUInt32LE(r)); p += 4; break;
        case "br8": arg = `IL_${(p + 1 + b.readInt8(r)).toString(16).padStart(4, "0")}`; p += 1; break;
        case "br32": arg = `IL_${(p + 4 + b.readInt32LE(r)).toString(16).padStart(4, "0")}`; p += 4; break;
        case "switch": {
          const n = b.readUInt32LE(r);
          const base = p + 4 + n * 4;
          const targets = Array.from({ length: n }, (_, i) => `IL_${(base + b.readInt32LE(r + 4 + i * 4)).toString(16).padStart(4, "0")}`);
          arg = `(${targets.join(", ")})`;
          p += 4 + n * 4;
          break;
        }
      }
      lines.push(`IL_${at.toString(16).padStart(4, "0")}: ${name}${arg ? " " + arg : ""}`);
    }
    return lines;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dll, ...names] = process.argv.slice(2);
  const d = new Disassembler(dll);
  if (names[0] === "--grep") {
    const needle = names[1];
    d.allMethods().forEach((m) => {
      let lines: string[];
      try {
        lines = d.disassemble(m);
      } catch {
        return;
      }
      if (lines.some((l) => l.includes(needle))) console.log(d.methodName(m));
    });
    process.exit(0);
  }
  for (const n of names) {
    const found = d.findMethods(n);
    if (!found.length) console.log(`// no encontrado: ${n}`);
    for (const m of found) console.log(d.disassemble(m).join("\n") + "\n");
  }
}
