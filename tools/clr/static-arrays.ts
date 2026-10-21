import { Disassembler } from "./disasm.ts";
import { Metadata } from "./metadata.ts";

export function readStaticIntArrays(dll: string, typeName: string, fields: string[]) {
  const md: any = new Metadata(dll);
  const dis = new Disassembler(dll);
  const [cctor] = dis.findMethods(`${typeName}::.cctor`);
  if (!cctor) throw new Error(`No hay constructor estático en ${typeName}`);
  const out: Record<string, number[]> = {};
  let length = 0;
  let rvaField = "";
  for (const line of dis.disassemble(cctor)) {
    const [, op, arg = ""] = /^IL_[0-9a-f]+: (\S+)(?: (.*))?$/.exec(line) ?? [];
    if (op === "ldc.i4" || op === "ldc.i4.s") length = Number(arg);
    else if (op === "ldtoken" && arg.startsWith("<PrivateImplementationDetails>::")) rvaField = arg.split("::")[1];
    else if (op === "stsfld" && arg.startsWith(`${typeName}::`)) {
      const name = arg.split("::")[1];
      if (fields.includes(name) && rvaField) {
        const fieldIndex = md.tables.Field.findIndex((f: number[]) => md.string(f[1]) === rvaField) + 1;
        const row = md.tables.FieldRVA.find((r: number[]) => r[1] === fieldIndex);
        if (!row) throw new Error(`Sin datos RVA para ${name}`);
        const o = md.offset(row[0]);
        out[name] = Array.from({ length }, (_, i) => md.b.readInt32LE(o + i * 4));
      }
      rvaField = "";
    }
  }
  for (const f of fields) if (!out[f]) throw new Error(`No encontré el arreglo estático ${typeName}::${f}`);
  return out;
}

export function readInlineIntArrays(dll: string, method: string) {
  const md: any = new Metadata(dll);
  const dis = new Disassembler(dll);
  const out: number[][] = [];
  for (const m of dis.findMethods(method)) {
    let length = 0;
    for (const line of dis.disassemble(m)) {
      const [, op, arg = ""] = /^IL_[0-9a-f]+: (\S+)(?: (.*))?$/.exec(line) ?? [];
      if (op?.startsWith("ldc.i4")) length = op === "ldc.i4" || op === "ldc.i4.s" ? Number(arg) : Number(op.split(".")[2]);
      else if (op === "ldtoken" && arg.startsWith("<PrivateImplementationDetails>::")) {
        const name = arg.split("::")[1];
        const fieldIndex = md.tables.Field.findIndex((f: number[]) => md.string(f[1]) === name) + 1;
        const row = md.tables.FieldRVA.find((r: number[]) => r[1] === fieldIndex);
        if (!row) throw new Error(`Sin datos RVA para ${name}`);
        const o = md.offset(row[0]);
        out.push(Array.from({ length }, (_, i) => md.b.readInt32LE(o + i * 4)));
      }
    }
  }
  return out;
}
