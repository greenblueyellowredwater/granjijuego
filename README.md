# stardew-ts

Motor clean-room en TypeScript + Phaser 3 que corre **el contenido de tu propia copia** de Stardew Valley.
Este repositorio no contiene ni distribuye assets, textos ni código del juego. Todo lo derivado de tu instalación queda en `public/content/` y `src/generated/`, que están en `.gitignore`.

Estado: **specs S2–S27 implementadas**. Plan, specs y reglas de trabajo en [docs/ESPEC.md](docs/ESPEC.md).

## Qué funciona

| Área | Detalle | Spec |
|---|---|---|
| Mundo | Granjero con movimiento, animación, colisiones, puertas y warps; árboles, arbustos y objetos de `Paths`; agua animada; orden de dibujo por lotes | S2–S5 |
| Tiempo | Reloj, calendario, iluminación, HUD, cama y sueño; clima diario con GameStateQuery (lluvia, nieve, viento) | S6–S7 |
| Granja | Herramientas, tierra arada, cultivos, siembra y cosecha; edificios de la granja; caja de envíos y venta nocturna; tala de árboles y escombros | S8 |
| Objetos | Colocar objetos y grandes fabricables, fertilizantes y Speed-Gro, cofres, máquinas con sus reglas y tiempos, antorchas | S19–S21 |
| Menús | Inventario, tooltips, página social, habilidades, artesanía, subida de nivel con elección de profesión, resumen de envíos | S12–S18 |
| NPCs | Horarios, rutas entre locations (A*), diálogo diario con retrato, regalos, amistad y emotes | S9, S11 |
| Tiendas | Pierre, Clint, Marnie, Robin, Gus, Willy y Harvey con stock y precios por GSQ; mejora de herramientas con Clint | S10, S22 |
| Pesca | Lance, picada, elección del pez por datos y minijuego de la barra | S23 |
| Minas y combate | Niveles generados, piedras, minerales, escaleras, ascensor; espada, daño, vida y desmayo; monstruos de los niveles 1–40 | S24–S25 |
| Eventos y correo | Condiciones, guiones, actores y preguntas (evento de Marlon); buzón, cartas, regalos y disparadores diarios | S26–S27 |

La partida se guarda en `localStorage`. El botón **Nueva partida** empieza de cero.

**En curso (sin commitear):** misiones y diario (`src/world/quests.ts`, `src/render/journal.ts`).

**Falta** (roadmap de [docs/ESPEC.md](docs/ESPEC.md)): animales y edificios construibles, monstruos de las minas después del nivel 40, Community Center, Special Orders, Isla, festivales y multijugador.

## Uso

```sh
npm install
npm run import -- "/ruta/a/Stardew Valley"   # carpeta que contiene Content/ y StardewValley.GameData.dll
npm run dev                                   # http://localhost:5173/
```

### Controles (modo mundo, por defecto)

| Acción | Tecla |
|---|---|
| Moverse / caminar | WASD o flechas / Shift |
| Usar herramienta | C o clic izquierdo (mantener para cargar la caña) |
| Interactuar, hablar, regalar | X o clic derecho |
| Menú del juego | E o Esc |
| Elegir ranura | 1–9, 0, `-`, `+` o rueda |
| Avanzar diálogo / confirmar | Enter o Espacio |
| Saltear evento | Esc |

Parámetros de URL para depurar: `map`, `x`, `y`, `season`, `weather` y `time` (600–2600). La URL sigue al jugador.

### Visor (`?mode=viewer`)

Rueda para zoom, arrastrar o flechas para moverse. El panel muestra las propiedades del tile bajo el cursor y si bloquea el paso.

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
- `npm run shots`: capturas de pantalla con el mismo setup que `e2e` (salen en `test/e2e/out/`).
- `npm run typecheck`
- `npm run build:wasm`: recompila el decodificador LZX (requiere Rust).
