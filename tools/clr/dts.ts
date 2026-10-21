import type { GeneratedSchemes, SchemeEntry } from "./gamedata-schemes.ts";

const PRIMS: Record<string, string> = {
  String: "string", Boolean: "boolean", Int32: "number", Int64: "number", Single: "number", Double: "number",
  Byte: "number", Char: "string", Object: "unknown",
  Vector2: "{ X: number; Y: number }", Point: "{ X: number; Y: number }",
  Rectangle: "{ X: number; Y: number; Width: number; Height: number }",
  Color: "{ R: number; G: number; B: number; A: number }",
};

const ident = (full: string) => full.split(/[./]/).pop()!;

function tsType(e: SchemeEntry): string {
  if (typeof e === "string") {
    if (e.startsWith("Array<")) return `${tsType(e.slice(6, -1))}[]`;
    return PRIMS[e] ?? ident(e);
  }
  if (Array.isArray(e)) return `${tsType(e[0])}[]`;
  const [k, v] = Object.entries(e)[0];
  return `Record<${tsType(k) === "number" ? "number" : "string"}, ${tsType(v)}>`;
}

export function schemesToDts(g: GeneratedSchemes, version: string) {
  const lines = [`// Generado por tools/import.ts desde StardewValley.GameData ${version}. No editar.`, ""];
  for (const e of [...g.enums].sort()) lines.push(`export type ${ident(e)} = number;`);
  lines.push("");
  for (const [name, scheme] of Object.entries(g.schemes).sort()) {
    lines.push(`export interface ${ident(name)} {`);
    for (const [k, v] of Object.entries(scheme)) {
      const optional = k.startsWith("$");
      lines.push(`  ${optional ? k.slice(1) : k}${optional ? "?" : ""}: ${tsType(v)}${optional ? " | null" : ""};`);
    }
    lines.push("}", "");
  }
  return lines.join("\n");
}
