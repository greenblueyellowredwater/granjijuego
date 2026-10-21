import { Disassembler } from "./disasm.ts";

type Line = { at: number; op: string; arg: string };

const parse = (l: string): Line | null => {
  const m = /^IL_([0-9a-f]+): (\S+)(?: (.*))?$/.exec(l);
  return m ? { at: parseInt(m[1], 16), op: m[2], arg: m[3] ?? "" } : null;
};

const short = (s: string) => s.replace(/StardewValley\./g, "").replace(/Microsoft\.Xna\.Framework\./g, "").replace(/System\./g, "");

export function blocks(dll: string, method: string, signatures: Record<string, number> = {}) {
  const d = new Disassembler(dll, true);
  const out: string[] = [];
  for (const m of d.findMethods(method)) {
    const lines = d.disassemble(m).map(parse).filter((x): x is Line => x !== null && x.op !== "nop");
    const targets = new Set<number>();
    for (const l of lines) {
      if (l.op.startsWith("b") || l.op.startsWith("leave")) for (const t of l.arg.matchAll(/IL_([0-9a-f]+)/g)) targets.add(parseInt(t[1], 16));
      if (l.op === "switch") for (const t of l.arg.matchAll(/IL_([0-9a-f]+)/g)) targets.add(parseInt(t[1], 16));
    }
    let stack: string[] = [];
    const locals: Record<string, string> = {};
    const pop = (n: number) => stack.splice(Math.max(0, stack.length - n), n);
    const label = (n: number) => `IL_${n.toString(16).padStart(4, "0")}`;
    for (const l of lines) {
      if (targets.has(l.at)) {
        if (stack.length) out.push(`  (pila al entrar: ${stack.join(" | ")})`);
        out.push(`${label(l.at)}:`);
        stack = [];
      }
      const { op, arg } = l;
      const bin = (sym: string) => {
        const [a, b] = pop(2);
        stack.push(`(${a} ${sym} ${b})`);
      };
      if (op.startsWith("ldc.i4")) stack.push(op === "ldc.i4" || op === "ldc.i4.s" ? arg : op === "ldc.i4.m1" ? "-1" : op.split(".")[2]);
      else if (op === "ldc.r4" || op === "ldc.r8") stack.push(`${+Number(arg).toPrecision(7)}f`);
      else if (op === "ldstr") stack.push(arg);
      else if (op === "ldnull") stack.push("null");
      else if (/^ldarg/.test(op)) stack.push(`arg${op.includes(".s") ? arg : op.split(".")[1]}`);
      else if (/^ldloca?/.test(op)) {
        const k = op.includes(".s") || op === "ldloc" || op === "ldloca" ? arg : op.split(".")[1];
        stack.push(locals[k] && !op.startsWith("ldloca") ? locals[k] : `${op.startsWith("ldloca") ? "&" : ""}loc${k}`);
      } else if (/^stloc/.test(op)) {
        const k = op.includes(".s") || op === "stloc" ? arg : op.split(".")[1];
        const [v] = pop(1);
        out.push(`  loc${k} = ${v}`);
        delete locals[k];
      } else if (/^starg/.test(op)) out.push(`  arg${arg} = ${pop(1)[0]}`);
      else if (op === "add") bin("+");
      else if (op === "sub") bin("-");
      else if (op === "mul") bin("*");
      else if (op === "div" || op === "div.un") bin("/");
      else if (op === "rem") bin("%");
      else if (op === "and") bin("&");
      else if (op === "or") bin("|");
      else if (op === "ceq") bin("==");
      else if (op === "cgt" || op === "cgt.un") bin(">");
      else if (op === "clt" || op === "clt.un") bin("<");
      else if (op === "neg") stack.push(`-${pop(1)[0]}`);
      else if (op.startsWith("conv.")) stack.push(`${op.slice(5)}(${pop(1)[0]})`);
      else if (op === "dup") stack.push(stack[stack.length - 1]);
      else if (op === "pop") out.push(`  descarta ${pop(1)[0]}`);
      else if (op === "ldfld" || op === "ldflda") stack.push(`${pop(1)[0]}.${short(arg).split("::")[1]}`);
      else if (op === "ldsfld" || op === "ldsflda") stack.push(short(arg));
      else if (op === "stfld") {
        const [o, v] = pop(2);
        out.push(`  ${o}.${short(arg).split("::")[1]} = ${v}`);
      } else if (op === "stsfld") out.push(`  ${short(arg)} = ${pop(1)[0]}`);
      else if (op === "stind.i4" || op === "stind.r4" || op === "stind.ref") {
        const [a, v] = pop(2);
        out.push(`  *${a} = ${v}`);
      } else if (op.startsWith("ldind")) stack.push(`*${pop(1)[0]}`);
      else if (op === "initobj") out.push(`  init ${pop(1)[0]}`);
      else if (op === "ldtoken" || op === "ldftn") stack.push(short(arg));
      else if (op === "ldvirtftn") stack.push(`${pop(1)[0]}::${short(arg).split("::")[1]}`);
      else if (op === "isinst" || op === "castclass") stack.push(`(${short(arg)})${pop(1)[0]}`);
      else if (op === "box" || op === "unbox.any") stack.push(pop(1)[0]);
      else if (op === "newarr") stack.push(`new ${short(arg)}[${pop(1)[0]}]`);
      else if (op === "ldlen") stack.push(`${pop(1)[0]}.Length`);
      else if (op === "ldelem.ref" || op.startsWith("ldelem")) {
        const [a, i] = pop(2);
        stack.push(`${a}[${i}]`);
      } else if (op.startsWith("stelem")) {
        const [a, i, v] = pop(3);
        out.push(`  ${a}[${i}] = ${v}`);
      } else if (op === "newobj" || op === "call" || op === "callvirt") {
        const sig = /\{([hs]),(\d+),([vr])\}$/.exec(arg);
        const name = short(arg.replace(/\{[^}]*\}$/, ""));
        const n = sig ? +sig[2] : (signatures[name] ?? 0);
        const args = pop(n);
        const self = sig?.[1] === "h" && op !== "newobj" ? pop(1)[0] : null;
        const expr = op === "newobj" ? `new ${name.replace("::.ctor", "")}(${args.join(", ")})` : `${self ? self + "." : ""}${name}(${args.join(", ")})`;
        if (sig?.[3] === "v" && op !== "newobj") {
          if (/::\.ctor$/.test(name) && self?.startsWith("&")) out.push(`  ${self.slice(1)} = new ${name.replace("::.ctor", "")}(${args.join(", ")})`);
          else out.push(`  ${expr}`);
        } else stack.push(expr);
      } else if (op === "ret") {
        out.push(`  return ${stack.length ? pop(1)[0] : ""}`);
        stack = [];
      } else if (op === "br" || op === "br.s" || op === "leave" || op === "leave.s") {
        out.push(`  goto ${arg}`);
        stack = [];
      } else if (op === "brtrue" || op === "brtrue.s") out.push(`  if (${pop(1)[0]}) goto ${arg}`);
      else if (op === "brfalse" || op === "brfalse.s") out.push(`  if (!${pop(1)[0]}) goto ${arg}`);
      else if (/^b(eq|ne|lt|le|gt|ge)/.test(op)) {
        const [a, b] = pop(2);
        const sym = { eq: "==", ne: "!=", lt: "<", le: "<=", gt: ">", ge: ">=" }[op.slice(1, 3)]!;
        out.push(`  if (${a} ${sym} ${b}) goto ${arg}`);
      } else if (op === "switch") out.push(`  switch (${pop(1)[0]}) ${arg}`);
      else out.push(`  ?? ${op} ${arg}`);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dll, method] = process.argv.slice(2);
  console.log(blocks(dll, method).join("\n"));
}
