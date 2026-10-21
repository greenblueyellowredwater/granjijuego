# stardew-ts

Motor clean-room en TypeScript + Phaser 3 que corre **el contenido de tu propia copia** de Stardew Valley.
Este repositorio no contiene ni distribuye assets, textos ni código del juego. Todo lo derivado de tu instalación queda en `public/content/` y `src/generated/`, que están en `.gitignore`.

Estado: **hito 2**. Importador completo, visor de mapas y granjero caminable con colisiones, puertas y warps entre mapas. Plan y reglas de trabajo en [docs/ESPEC.md](docs/ESPEC.md).

## Uso

```sh
npm install
npm run import -- "/ruta/a/Stardew Valley"   # carpeta que contiene Content/ y StardewValley.GameData.dll
npm run dev                                   # http://localhost:5173/?map=Town&x=43&y=57
```

- **Mundo** (por defecto): WASD o flechas para moverse, Shift para caminar, X/E/clic derecho para interactuar (puertas). Parámetros `map`, `x`, `y` y `season`; la URL sigue al jugador.
- **Visor** (`?mode=viewer`): rueda para zoom, arrastrar o flechas para moverse; el panel muestra las propiedades del tile bajo el cursor y si bloquea el paso.

## Qué hace el importador

| Entrada (`Content/`) | Salida (`public/content/`) |
|---|---|
| `Texture2D` `.xnb` | `.png` |
| Mapas xTile (TBIN) | `.tmj` (JSON de Tiled) |
| `Data/`, `Strings/`, `Characters/…` | `.json` |
| SpriteFont / BmFont | `.png` + `.spritefont.json` / `.fnt` |
| `StardewValley.GameData.dll` | esquemas de lectura + `src/generated/gamedata.d.ts` |

## Rendimiento

El import completo (3550 archivos, 1.6.15) tarda unos **9 s** en 8 núcleos:
- la descompresión LZX de XNB la hace un decodificador en Rust compilado a WASM (`native/xnb-lzx`, crate `lzxd`), unas 18 veces más rápido que el de xnb.js;
- los archivos se reparten entre `worker_threads`, uno por núcleo.

El `.wasm` se versiona ya compilado en `tools/wasm/`, así que no hace falta Rust para importar. Para recompilarlo: `rustup target add wasm32-unknown-unknown && npm run build:wasm`.

## Scripts

- `npm run import -- <dir> [salida]`: importa el contenido.
- `npm run dev` / `npm run build`
- `npm test`: tests unitarios. Con `STARDEW_DIR=<dir>` también corre la integración contra tu instalación.
- `npm run e2e`: recorridos en Chrome headless contra `npm run dev` (`E2E_URL` para otro puerto, `CHROME_PATH` para otro navegador).
- `npm run typecheck`
- `npm run build:wasm`: recompila el decodificador LZX (requiere Rust).
