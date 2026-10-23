import { Metadata } from "./metadata.ts";

const [dll, ...types] = process.argv.slice(2);
const md = new Metadata(dll);
const t = md.tables;
const methodOwner = new Map<number, number>();
for (let i = 1; i <= t.TypeDef.length; i++) for (const m of md.memberRange("MethodDef", i)) methodOwner.set(m, i);
for (const [parent, ctor, blob] of t.CustomAttribute) {
  if ((parent & 31) !== 0 || (ctor & 7) !== 2) continue;
  const ctorType = methodOwner.get(ctor >> 3);
  if (!ctorType || !md.typeDefName(ctorType).endsWith("OtherNamesAttribute")) continue;
  const method = parent >> 5;
  const owner = md.typeDefName(methodOwner.get(method)!);
  if (types.length && !types.some((x) => owner.endsWith(x))) continue;
  const b = md.blob(blob);
  let p = 2;
  const n = b.readInt32LE(p);
  p += 4;
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const len = b[p];
    p++;
    names.push(b.subarray(p, p + len).toString("utf8"));
    p += len;
  }
  console.log(`${owner}::${md.string(t.MethodDef[method - 1][3])} = ${names.join(" ")}`);
}
