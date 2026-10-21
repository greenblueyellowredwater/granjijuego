# Stardew Valley → TypeScript + Phaser: especificación clean-room

Fuente analizada: `Stardew Valley.dll` 1.6.15.24356 (sha256 `7f1e5b8e…deaee`, MVID `aa1f513a…`), `StardewValley.GameData.dll`, `xTile.dll` y `Content/`.
Análisis estático con REA (metadatos, sin ejecutar ni decompilar a C#) y un lector propio de tablas ECMA-335 (`tools/clr/metadata.ts`).

## 0. Modelo legal y de trabajo (leer primero)

- **Motor propio + datos del usuario**, como OpenMW u OpenRCT2. El repo no incluye ningún asset ni texto del juego. El usuario importa su propia carpeta `Content/` (`npm run import`).
- **Clean-room de dos roles.** El *analista* mira la DLL (REA/ILSpy) y escribe specs de comportamiento en prosa y tablas: entradas, salidas, fórmulas y casos borde. El *implementador* escribe TS leyendo **solo** las specs y los datos, nunca código decompilado. Si sos una sola persona, separalo en el tiempo y no copies ni traduzcas nombres de variables locales ni estructura de funciones.
- Lo que **sí** se puede reproducir 1:1: los formatos de datos (interoperabilidad), los nombres de comandos que aparecen dentro de los datos y las reglas o fórmulas de juego.
- Lo que **no**: copiar o traducir código decompilado, ni distribuir sprites, música, mapas o textos.

## 1. Tamaño del problema (medido)

| Métrica | Valor |
|---|---|
| Tipos | 1887 |
| Métodos | 18 367 |
| IL total | 3.13 MB (≈250–350 k líneas de C#) |
| Campos | 12 801 |
| Archivos en Content | 3550 `.xnb`, 544 MB |

IL por área (en KB): núcleo 1140 · Menús 527 · Locations 374 · Minijuegos 208 · Objects 112 · Monsters 103 · efectos (BellsAndWhistles) 70 · Tools 69 · TerrainFeatures 67 · Buildings 54 · Characters 54 · Events 38 · red 63.

Clases más pesadas (IL en bytes): `GameLocation` 173k · `Event` 127k · `Game1` 115k · `Farmer` 73k · `Object` 69k · `NPC` 60k · `Utility` 54k · `MineShaft` 46k.

Desde la 1.6 el juego es data-driven: el motor TS es sobre todo un **intérprete de `Content/Data`**, más unos ~40 sistemas con lógica propia.

## 2. Stack (sin reinventar motores)

| Original | Rol | Reemplazo TS |
|---|---|---|
| MonoGame 3.8 | loop, SpriteBatch, input, audio | Phaser 3 |
| xTile (TBIN) | mapas por capas | `tools/tbin.ts` → JSON de Tiled → tilemap de Phaser |
| XNB (LZX) | contenedor de assets | xnb.js (solo el core y los readers base) + esquemas generados (§3) |
| BmFont / SpriteFont | fuentes | `BitmapText` de Phaser |
| XACT | audio | pendiente: extraer a OGG y reproducir con Howler |
| Lidgren / Steam / Galaxy | red | al final: WebRTC o WebSocket autoritativo |
| Netcode (`NetFields`…) | sync de campos | no replicar; usar diffs de estado |
| XmlSerializer | guardado | JSON propio + importador opcional del XML original |
| `System.Random` + xxHash | RNG determinista | reimplementar (§5) |
| `StardewValley.Pathfinding` | rutas NPC | A* sobre grilla |

## 3. Pipeline de contenido

```
Content/ ──npm run import──► public/content/
  Texture2D            → PNG (alpha directo, no premultiplicado)
  Maps (TBIN)          → .tmj de Tiled (capas, tilesheets, props, animaciones)
  Data/Strings/…       → JSON
  SpriteFont / BmFont  → PNG + glifos / .fnt
StardewValley.GameData.dll → esquemas de lectura + src/generated/gamedata.d.ts
```

## 4. Modelo de datos

`StardewValley.GameData.dll` (170 tipos, 139 con esquema y 29 enums) **es el esquema** de `Content/Data`. Las interfaces TS se generan en el import (`src/generated/gamedata.d.ts`).

Namespaces: BigCraftables, Buffs, Buildings, Bundles, Characters, Crafting, Crops, FarmAnimals, Fences, FishPonds, FloorsAndPaths, FruitTrees, GarbageCans, GiantCrops, HomeRenovations, LocationContexts, Locations, **Machines**, MakeoverOutfits, Minecarts, Movies, Museum, Objects, Pants, Pets, Powers, Shirts, **Shops**, SpecialOrders, Tools, Weapons, Weddings, WildTrees y WorldMaps, más `Season`, `Gender`, `QuantityModifier` y `GenericSpawnItemData` en la raíz.

## 5. Determinismo / RNG

Observado (destinos de llamada en el IL):
- `Utility.CreateRandom` → `CreateRandomSeed` → `new System.Random(seed)`.
- `CreateRandomSeed` usa `IHashUtility.GetDeterministicHashCode` (xxHash), salvo que `Game1.UseLegacyRandom` esté activo.
- `CreateDaySaveRandom` siembra con `Stats.DaysPlayed` (más el ID de la partida, a confirmar).
- `Crop.newDay` y `HoeDirt.dayUpdate` consumen `Random.Next` / `NextBool`.

Hace falta: (a) el `System.Random` sembrado de .NET (generador sustractivo de Knuth, público); (b) xxHash32; (c) una spec, sistema por sistema, de qué entra en cada semilla.

## 6. Arquitectura del runtime

```
core/      GameClock (10 min por tick, 6:00–2:00) · RNG · EventBus
data/      DataRegistry (JSON + gamedata.d.ts) · i18n (Strings + TokenParser)
query/     GameStateQuery · ItemQueryResolver · TriggerActions · Preconditions
world/     Location · TerrainFeature · Object · Building · Warps
entities/  Farmer · NPC · FarmAnimal · Monster · Pet
items/     Item → Object | Tool | Ring | Boots | Hat | Clothing ; Inventory
systems/   Crops · Machines · Fishing · Combat · Mining · Shops · Quests · Friendship · Mail
script/    EventScript · Dialogue
ui/        menús
save/      JSON
net/       (último)
```
La simulación es TS puro, testeable headless. Phaser es solo presentación.

## 7. Lenguajes embebidos en los datos (interoperabilidad)

- **GameStateQuery**: 115 resolvers (`DAY_OF_MONTH`, `SEASON`, `WEATHER`, `PLAYER_HAS_MAIL`, `PLAYER_HEARTS`, `ITEM_CONTEXT_TAG`, `LOCATION_NAME`, `RANDOM`, `ANY`…).
- **Event script**: 142 comandos (`Speak`, `Move`, `Warp`, `Emote`, `Question`, `Fork`, `PlayMusic`, `TemporaryAnimatedSprite`, `End`…) y 55 preconditions.
- **TriggerActions**: 27 acciones (`AddMail`, `AddItem`, `AddMoney`, `If`, `MarkEventSeen`…).
- **ItemQuery**: 17 resolvers (`ALL_ITEMS`, `RANDOM_ITEMS`, `FLAVORED_ITEM`, `LOCATION_FISH`, `DISH_OF_THE_DAY`…) y los IDs calificados `(O)`, `(BC)`, `(T)`, `(W)`…
- **TokenizableStrings**: 23 tokens (`[LocalizedText …]`, `[ItemName …]`, `[CharacterName …]`…).
- **Dialogue** (`$h`, `$q`, `$e`, `$b`, `#`…) y **schedules** de NPC.

Implementarlos como registros extensibles (`register(name, fn)`) y testear cada handler por separado.

## 8. Loop principal (orden observado en `Game1`)

`Update` → input · menú activo · `UpdateGameClock` (→ `performTenMinuteClockUpdate` → `GameLocation.performTenMinuteUpdate`) · locations y personajes · música · clima.
`Draw` → `DrawWorld` (Back → decoraciones de piso → personajes → Buildings → Front → AlwaysFront) → `DrawLighting` → HUD → menú → fade.
Cambio de día: `NewDay` → `newDayAfterFade` → clima, `GameLocation.DayUpdate` (→ `HoeDirt.dayUpdate` → `Crop.newDay`), forraje, mail, shipping y guardado.
`StardewValley.Mods.ModHooks` engancha esos puntos: sirve para trazar el juego real.

## 9. Roadmap

| # | Hito | Estado |
|---|---|---|
| 1 | Importador + visor de mapas | **hecho** |
| 2 | Caminar por el pueblo: colisión (`Passable`/Buildings), warps, cámara, sprite del granjero | **hecho** (spec S2) |
| 3 | Reloj, días, estaciones, clima, RNG | |
| 4 | Granja básica: azada, regadera, HoeDirt, cultivos, inventario, shipping | |
| 5 | GameStateQuery, ItemQuery, tiendas, máquinas | |
| 6 | NPCs: schedules, pathfinding, diálogo, regalos | |
| 7 | Eventos y TokenParser | |
| 8 | Minas y combate | |
| 9 | Pesca | |
| 10 | Edificios y animales | |
| 11 | Community Center, Special Orders, Isla, festivales | |
| 12 | Multijugador | |

## 10. Cómo usar REA para cada spec

1. `inspect_managed_members` con `type_names: ["StardewValley.Crop"]`. Con el ensamblado completo excede el presupuesto, así que siempre hay que acotar por tipo.
2. Grafo de llamadas: página `call_edges`.
3. La decompilación (ILSpy) la lee **solo el analista**, que escribe la spec en prosa.
4. Validación: comparar trazas del juego real (por ejemplo con un mod SMAPI) contra el motor headless.

## Hito 1: resultados (2026-10-21)

- `npm run import` lee los 3550 `.xnb` de la 1.6.15 sin errores: 1019 texturas, 259 mapas, 2240 archivos de datos y 30 fuentes. Tarda unos 9 s.
- Rendimiento: el LZX de xnb.js (JS puro, ~17 MB/s) se llevaba 53 de 80 s. Se reemplazó por `lzxd` (Rust → WASM, `native/xnb-lzx`), que hace 897 MB en 3 s con salida idéntica byte a byte en los 3541 archivos comprimidos. Además los archivos se reparten entre `worker_threads`, uno por núcleo. La salida del import es idéntica a la versión anterior (md5 de los 3574 archivos).
- Los 69 `Data/*.xnb` raíz se consumen hasta el último byte, lo que confirma la alineación de los esquemas.
- **xnb.js no alcanza solo.** Su plugin de Stardew tiene esquemas y lectores escritos a mano para una 1.6 anterior, y fallaban 22 archivos. Por eso los esquemas se **generan desde los metadatos de `StardewValley.GameData.dll`** de la instalación del usuario (`tools/clr/`), con las reglas de `ReflectiveReader` de MonoGame:
  - primero los miembros de la clase base;
  - después las propiedades públicas con setter, o colecciones de solo lectura;
  - después los campos públicos que no sean `readonly`;
  - `[ContentSerializer]` incluye el miembro y `[ContentSerializerIgnore]` lo excluye;
  - los tipos de referencia y `Nullable<T>` van con prefijo `$`, y los enums se leen como `Int32`.
- No se usan los lectores a mano del plugin. Se agrega un lector `Object` polimórfico para `Dictionary<string, object>`.
- Las texturas salen con alpha directo, no premultiplicado, y van tal cual a PNG.
- Mapas: parser TBIN propio → JSON de Tiled. Las propiedades por tile van en la propiedad de capa `tileProperties` y las animaciones en `animations`. Las `@TileIndex@N@Prop` de cada tilesheet pasan a `tiles[].properties`.
- Orden de dibujo: `Back`, `BackN`, `Buildings`, `BuildingsN`, `Front`, `FrontN`, `AlwaysFront`, `AlwaysFrontN`. `Paths` no se dibuja.
- Pendiente: audio XACT (`.xwb`/`.xsb`/`.xgs`) y efectos (`.mgfxo`).

## Spec S2: movimiento, colisión, warps y dibujo del granjero

Fuente: lectura del IL (`tools/clr/disasm.ts`) de los métodos citados en cada punto. Lo marcado (?) sigue siendo inferencia.

**Tiempo.** El juego corre a paso fijo de 60 actualizaciones por segundo y cada actualización ve **16 ms** (los milisegundos enteros de 1/60 s). Todo lo que sigue usa `ms = 16` por tick, y la simulación tiene que avanzar en ticks fijos, independientemente de los FPS de dibujo.

**Unidades y posición** (`Farmer.GetBoundingBox`, `Game1.onFadeToBlackComplete`). El mundo usa 64 px por tile. La caja del granjero es `(X+8, Y, 48, 32)`, donde `(X, Y)` es su posición. Al llegar a un tile `(tx, ty)` por warp, la posición queda en `(tx·64, ty·64 + 16)`, así que la caja ocupa la mitad inferior del tile.

**Velocidad** (`Farmer.setRunning`, `getMovementSpeed`). La velocidad entera es 5 corriendo y 2 caminando. El desplazamiento por tick es `max(1, velocidad × 0,066 × ms)`, que con 16 ms da 5,28 o 2,112 px. Si hay más de una dirección apretada, se multiplica por 0,707.

**Paso** (`Farmer.MovePosition`, `MovePositionImpl`, `Character.nextPosition`, `Farmer.nextPositionHalf`). Las direcciones apretadas se procesan en este orden: **arriba, abajo, derecha, izquierda**. Para cada una:
1. Se proyecta la caja la **velocidad entera** (5 o 2 px) en esa dirección.
2. Si la caja proyectada toca un warp (ver más abajo), se ejecuta el warp y se cortan las demás direcciones.
3. Si la caja proyectada no colisiona, la posición avanza el desplazamiento del tick en esa dirección.
4. Si no, se prueba media caja: se proyecta `⌈desplazamiento/2⌉`. Si no colisiona, se avanza medio desplazamiento.
5. Si no, y hay **una sola** dirección apretada, se intenta **rodear la esquina**:
   - Moviéndose en vertical: se toman los cuartos izquierdo y derecho de la caja proyectada (ancho/4, el segundo desplazado 3·ancho/4). Si choca solo el izquierdo y la caja proyectada a la derecha está libre, X aumenta `velocidad × ms / 64` (1,25 px corriendo). Si choca solo el derecho y la izquierda está libre, X disminuye lo mismo.
   - Moviéndose en horizontal: lo mismo con los cuartos superior e inferior y un empuje en Y.

**Orientación** (`Farmer.updateMovementAnimation`). Prioridad: izquierda, derecha, arriba, abajo.

**Colisión con tiles.** Las reglas de qué tile bloquea no cambian respecto de la versión anterior (`Back` con `Passable` o `Water`, `Buildings` sin `Passable`/`Shadow`, `Action` bloquea, sin `Back` bloquea (?), fuera del mapa bloquea salvo que haya un warp). Se testean las esquinas de la caja, tomando la esquina derecha e inferior como `borde − 1` (?).

**Warps** (`GameLocation.isCollidingWithWarp`). Un warp se activa si su X coincide con `⌊izq/64⌋` o `⌊der/64⌋` de la caja proyectada **y** su Y coincide con `⌊arriba/64⌋` o `⌊abajo/64⌋`. Acá derecha y abajo son los bordes exclusivos (`X+ancho`, `Y+alto`). Gana el primer warp de la lista. Los warps `NPCWarp` no aplican al granjero. Formato: grupos de 5 `desdeX desdeY destino haciaX haciaY`, ignorando los inválidos.

**Acciones al interactuar** (`Action` en `Buildings`, tile enfrente): `Warp x y Destino`; `LockedDoorWarp x y Destino apertura cierre` (horario pendiente del reloj); `Door Npc…` y el resto, pendientes. **Al pisar** (`TouchAction` en `Back`): pendiente. **Resolución de mapas**: `Data/Locations[nombre].CreateOnLoad.MapPath`, y si no existe, `Maps/<nombre>`.

**Animación** (`FarmerSprite.getAnimationFromIndex`, `animate`, `UpdateSourceRect`).
- Índices: caminando abajo/derecha/arriba/izquierda = 0/8/16/24; corriendo = 32/40/48/56.
- Frames, como `frame:ms(desplazamientoY)`; la izquierda es la derecha con espejado:

| Animación | Frames |
|---|---|
| Caminar abajo | 1:200 · 0:200 · 2:200 · 0:200 |
| Caminar derecha | 7:200 · 6:200 · 8:200 · 6:200 |
| Caminar arriba | 13:200 · 12:200 · 14:200 · 12:200 |
| Correr abajo | 0:90 · 1:60(−2) · 18:120(−4) · 1:60(−2) · 0:90 · 2:60(−2) · 19:120(−4) · 2:60(−2) |
| Correr derecha | 6:80 · 6:10(−1) · 20:140(−2) · 11:100(0) · 6:80 · 6:10(−1) · 21:140(−2) · 17:100(0) |
| Correr arriba | 12:90 · 13:60(−2) · 22:120(−3) · 13:60(−2) · 12:90 · 14:60(−2) · 23:120(−3) · 14:60(−2) |

- Avance: el temporizador suma `ms` por tick. Cuando supera `ms_del_frame × modificador`, pasa al frame siguiente (en loop) y el temporizador vuelve a 0, sin arrastrar el sobrante. Al moverse, el modificador vale `1 − k × max(1, velocidad × 0,066 × ms) × 1,25`, con `k = 0,0255` corriendo y `0,025` caminando. Si no, vale 1.
- Al cambiar de animación (por ejemplo, de dirección) se conservan el temporizador y el índice de frame, este último acotado al largo de la nueva animación.
- Quieto: frame 0 abajo, 6 derecha, 12 arriba y 6 espejado a la izquierda (?).
- Rectángulo de origen del frame `f`: `x = (f·16) mod 96`, `y = ⌊f·16/96⌋·32`, de 16 × 32. Es decir, 6 frames por fila dentro de los primeros 96 px de `farmer_base`.
- Brazos: el mismo rectángulo corrido `armOffset × 16` px. `armOffset` vale 6 (12 si carga algo), y los brazos se dibujan encima del cuerpo.

**Dibujo** (`Farmer.draw`, `FarmerRenderer.draw`). La esquina superior izquierda del sprite (64 × 128 px de mundo) está en `(⌊X⌋, ⌊Y⌋ − 96 + desplazamientoY·4)`, así que el borde inferior del sprite coincide con el de la caja.

**Sombra** (`Farmer.DrawShadow`). Textura `LooseSprites/shadow`, centrada en `(X+32, Y+24)`, a escala `4 − (corriendo y con índice de animación > 1 ? |featureYOffsetPerFrame[frame]|·0,5 : 0)`. Se dibuja justo debajo del granjero. `featureYOffsetPerFrame` es una tabla estática de 126 enteros que se obtiene de la DLL.

**Orden de dibujo del mundo** (`Game1.DrawWorld`):
1. Fondo.
2. Capa `Back` y sus subcapas.
3. Agua (`drawWater`).
4. Decoraciones del piso.
5. **Sombras normales.**
6. Capa `Buildings` y sus subcapas.
7. **Sombras "sobre edificios".**
8. Personajes y objetos (`GameLocation.draw`, ordenados por profundidad).
9. Capa `Front`, `drawAboveFrontLayer` y `AlwaysFront`.
10. Clima.
11. Iluminación.

**Sombra sobre `Buildings`** (`Game1.checkCharacterTilesForShadowDrawFlag`, `GameLocation.shouldShadowBeDrawnAboveBuildingsLayer`, `Farm.shouldShadowBeDrawnAboveBuildingsLayer`). Se dibuja después de `Buildings` si el granjero está en un puente, o si alguno de los tiles que cubre la caja, con el alto extendido 8 px (de `⌊izq/64⌋` a `⌊der/64⌋` y de `⌊arriba/64⌋` a `⌊abajo/64⌋`, con bordes exclusivos), cumple alguna de estas condiciones:
- el tile de `Buildings` tiene `Passable`;
- hay tierra arada;
- es agua y el tile de `Buildings` no es de la hoja `Town` con índice entre 1004 y 1013 (sin tile cuenta como "no es");
- hay un edificio construido atravesable;
- en la granja, el tile de `Back` tiene `NoSpawn=All` y `Type=Wood`.

Si ninguno cumple, la sombra va antes de `Buildings` y queda tapada por paredes y cercas.

**Cámara** (`Game1.UpdateViewPort`, `clampViewportToGameMap`). Se centra en el centro de la caja del granjero y se limita a los bordes del mapa. En el eje donde el mapa es más chico que la pantalla, se centra el mapa.

## Hito 2: resultados (2026-10-21)

- Simulación pura en `src/world/` (`Location`, `step`), testeada sin Phaser, más recorridos de punta a punta con puppeteer (`npm run e2e`): puerta de Pierre ida y vuelta, borde oeste de Town → BusStop y paredes.
- Primera versión con aproximaciones, corregidas en la revisión S2 (ver más abajo).
- `LockedDoorWarp` ignora el horario hasta que exista el reloj (hito 3). `Door`, `TouchAction` y el resto de las acciones solo se informan en el HUD.
- El granjero se dibuja solo con cuerpo y brazos base; falta la spec `FarmerRenderer` (ropa, pelo, piel).

## Revisión S2: paridad de movimiento y dibujo (2026-10-21)

Correcciones tras leer el IL. Antes eran supuestos y ahora siguen la spec S2:
- Paso fijo de 16 ms a 60 Hz. El desplazamiento es 5,28 px por tick corriendo, no 5.
- Caja en `(X+8, Y)` y llegada en `(tx·64, ty·64+16)`. El sprite estaba dibujado 16 px más abajo.
- Direcciones procesadas en orden arriba, abajo, derecha, izquierda, con medio paso y rodeo de esquinas en vez de deslizar por ejes.
- Warps por contacto de la caja proyectada, antes de moverse. Antes se activaban por el centro de la caja.
- Tablas reales de animación (frames, ms, rebote vertical, espejado), con 6 frames por fila y no 18, intervalos acelerados según la velocidad y animación activa también contra una pared.
- Sombra, cámara centrada en mapas chicos y mundo dibujado en píxeles de juego (escala ×4, zoom 1).
- `tools/clr/disasm.ts` (desensamblador de IL para el analista) y `tools/clr/static-arrays.ts` (tablas estáticas extraídas en el import, sin versionar datos del juego).

Diferencias visibles que siguen pendientes, cada una con su propia spec:
- `FarmerRenderer`: ropa, pelo, ojos, recoloreo de piel y zapatos.
- Terrain features generados desde la capa `Paths` (árboles, arbustos, pasto) y objetos o muebles iniciales (por ejemplo los de la casa).
- Capa de agua animada (`GameLocation.drawWater`).
- NPCs, bichos, partículas de clima, iluminación por hora y ambiente de interiores.
- Duración del fundido de warp: uso 150 ms, que es una aproximación.
- Pasos con sonido y el resto del audio (XACT pendiente).

## Incógnitas

- Composición exacta de las semillas por sistema.
- Conversión de audio XACT a OGG (herramienta y licencia a definir).
