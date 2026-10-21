import { parentPort, workerData } from "node:worker_threads";
import type { GeneratedSchemes } from "./clr/gamedata-schemes.ts";
import { convertFile } from "./convert.ts";
import { configureXnb } from "./xnb.ts";

const { schemes, contentDir, outDir } = workerData as { schemes: GeneratedSchemes; contentDir: string; outDir: string };
configureXnb(schemes);

parentPort!.on("message", (batch: string[]) => {
  parentPort!.postMessage(batch.map((rel) => convertFile(contentDir, rel, outDir)));
});
