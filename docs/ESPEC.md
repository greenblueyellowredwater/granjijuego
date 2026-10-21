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

Implementado en `src/world/dotnet-random.ts`, con estos pasos:
1. `CreateRandomSeed` reduce cada argumento a `(int)(v mod 2147483647)`.
2. Empaqueta los 5 enteros en 20 bytes little-endian.
3. Calcula xxHash32 con semilla 0, que se lee como `Int32` (`BitConverter`); se usa la librería `System.Data.HashFunction.xxHash` que trae el juego.
4. Siembra un `System.Random` (algoritmo sustractivo de Knuth de .NET).

Lo verifican vectores de .NET (`Random(0)`: 1559595546, 1755192844, 1649316166) y de xxHash32. Falta especificar, sistema por sistema, qué entra en cada semilla.

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
| 2b | Vegetación y objetos de `Paths`, agua animada, orden de dibujo por lotes | **hecho** (specs S3 y S4) |
| 3 | Reloj, días, estaciones, iluminación, HUD, sueño y clima | **hecho** (specs S6 y S7) |
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

**Orden de dibujo del mundo** (`Game1.DrawWorld`, `xTile.Layers.Layer.DrawNormal`). Se dibuja en lotes de `SpriteBatch`:
1. Fondo, capa `Back` y subcapas, agua y decoraciones del piso. Se dibujan sin ordenar.
2. **Sombras normales**, luego `Buildings` y subcapas, sin ordenar. Así las sombras quedan tapadas por `Buildings`.
3. **Lote ordenado por profundidad** (`SpriteSortMode.FrontToBack`, menor profundidad = más atrás): sombras "sobre edificios", personajes, árboles, objetos y arbustos (`GameLocation.draw`), **los tiles de `Front` y sus subcapas**, y `drawAboveFrontLayer`.
   - Cada tile de la fila `r` tiene profundidad `((r+1)·64 + offset)/10000`. `Back` no se ordena (offset −1). Para `Front`, el offset de la subcapa `i` de `n` es `64 + 0,1·i/(n−1)`, o 64 si hay una sola.
   - Consecuencia: un tile de `Front` tapa al granjero solo si el granjero está "detrás", es decir, si `centroY_caja < (r+2)·64`. Si está más abajo, el granjero se dibuja por delante.
4. `AlwaysFront`, siempre encima, y `drawAboveAlwaysFrontLayer`.
5. Clima, iluminación y HUD.

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

## Spec S3: objetos y vegetación de la capa `Paths`

Fuente: `GameLocation.loadObjects`, `loadPathsLayerObjectsInArea`, `TryGetTreeIdForTile`, `getWeedForSeason`, y los métodos `draw`, `getBoundingBox` e `isPassable` de `Tree`, `Bush`, `Object` y `ResourceClump`. Se ejecuta **una vez, al crear la location**; después lo generado persiste con el guardado.

**Recorrido.** Se recorre la capa `Paths` por columnas (x externo, y interno). El índice es el del tile dentro de la hoja de `Paths`. No se genera nada donde ya hay un objeto o terrain feature.

| Índice | Resultado |
|---|---|
| 9 / 10 / 11 / 12 / 31 / 32 | Árbol silvestre `1`/`2`/`3`/`6`/`9`/`8` (en invierno, `4` y `5` en vez de `1` y `2`, que el constructor normaliza a `1` y `2` (?)), etapa 5 |
| 34 | Árbol según la propiedad del tile `SpawnTree: wild\|fruit <id> [etapaAlCargar] [etapaAlRebrotar]`; etapa por defecto 5 (silvestre) o 4 (frutal) |
| 13 / 14 / 15 | Maleza de la estación (primavera `784/674/675`, verano `785/676/677`, otoño `786/678/679`), salvo al aire libre en invierno |
| 16 / 17 | Piedra `343` o `450` |
| 18 | Rama `294` o `295` |
| 19 / 20 / 21 | Grupo de recursos 2×2 con índice `602` / `672` / `600`, que borra los terrain features de abajo |
| 22 / 36 | Pasto tipo 1 / 7, con 3 matas (no se genera si se superpone con un grupo de recursos) |
| 23 | Árbol silvestre de tipo al azar entre 1 y 3, etapa al azar entre 2 y 3 |
| 24 / 25 / 26 / 33 | Arbusto de tamaño 2 / 1 / 0 / 4 |

**Azar y persistencia, como en el original.**
- **Cuándo se genera:** al crear la partida (`Game1.random` es un `System.Random()` sin semilla en `Game1..cctor`), así que el resultado cambia en cada partida nueva y después persiste con el guardado. Acá se genera la primera vez que se visita cada location, con la estación de la partida (primavera, día 1), y se persiste en el estado de partida (`localStorage`). El botón "Nueva partida" lo descarta.
- **En qué mapas:** solo si la location es exterior (`Outdoors`), es `BathHouse_Entry`, tiene `TreatAsOutdoors` o tiene `forceLoadObjects`.
- **Árboles previos:** antes de `Paths` se cargan los de la propiedad de mapa `Trees` (tripletas `x y tipo`, que crean el árbol `tipo+1` en etapa 5). `LoadTreesFrom` solo se usa en mapas de festival y queda pendiente.
- **Elegir entre opciones:** `Choose` con 2 opciones usa `NextDouble() < 0,5`; con 3 usa `Next(3)`. `NextBool` es `NextDouble() < 0,5`.

**Árbol** (adulto, etapa ≥ 5):
- Textura: la primera entrada de `Data/WildTrees[id].Textures` cuya estación coincida, o si no la que no tiene estación.
- Caja: el tile. Bloquea el paso salvo en la etapa 0.
- Sombra: de `Cursors (663,1011,41,30)` si es frondoso en la estación actual (`IsLeafy`, `IsLeafyInWinter`, `IsLeafyInFall`), o de `Cursors_1_6 (469,298,42,31)` si no. Se dibuja en `(tx·64−51, ty·64−16)`, escala 4, profundidad 1e−6.
- Copa: `(0,0,48,96)` de la textura (48 = con semilla, 96 = con musgo), con la esquina en `(tx·64−64, ty·64−320)`. Profundidad `((ty+1)·64 + 2)/10000 − tx/10⁶`. Espejado al azar.
- Tronco: `(32,96,16,32)` en `(tx·64, ty·64−64)`, profundidad `(ty+1)·64/10000`.
- Transparencia (`Tree.tickUpdate`): en cada tick, `alfa = min(1, alfa + 0,05)`. Si el árbol es adulto (sin tocón y sin estar cayendo) y la caja del jugador se superpone con `(64·(tx−1), 64·(ty−5), 192, 288)`, además `alfa = max(0,4, alfa − 0,09)`. El alfa se aplica a la copa y al tronco, no a la sombra.
- Árboles jóvenes (etapa < 5): `(32|0|16, 128, 16, 16)` para las etapas 0 / 1 / 2, o `(0, 96, 16, 32)` para la 3 y la 4. El sprite se dibuja centrado horizontalmente en el tile y apoyado en su borde inferior.

**Arbusto** (`TileSheets/bushes`; tamaño efectivo: el 3 cuenta como 0 y el 4 como 1):
- Caja: ancho 64 / 128 / 192 según tamaño 0 / 1 / 2, alto 64. Nunca se atraviesa.
- En Town, los de tamaño 0 a 2 con `tx mod 5 ≠ 0` son "de pueblo".
- Rectángulo de origen según tamaño (estación: 0 primavera … 3 invierno; offset de flor 0 mientras no haya reloj):
  - 0: `(est·32 + offset·16, 224, 16, 32)`;
  - 1 de pueblo: `(est·32, 96, 32, 32)`;
  - 1 normal: con `i = est·64 + offset·32`, `(i mod anchoTextura, ⌊i/anchoTextura⌋·48, 32, 48)`;
  - 2: de pueblo en primavera o verano `(48,176,48,48)`; si no, primavera o verano `(0,128,48,48)`, otoño `(48,128,48,48)`, invierno `(0,176,48,48)`.
- Dibujo: esquina en `(tx·64, (ty+1)·64 − yOff − 128)`, donde `yOff = 64` salvo en tamaño 0, en el mediano de pueblo y en el tamaño 4 (en esos, 0). Profundidad `(centroY_caja + 48)/10000 − tx/10⁶`. Espejado al azar.
- Sombra (solo si no hay tile `Front` en su tile): tamaños ≥ 1 usan `Cursors (663,1011,41,30)` en `((tx + (ef=1 ? 0,5 : 1))·64 − 51, ty·64 − 16)`; tamaño 0 usa la sombra estándar centrada en `(tx·64+32, ty·64+60)`. Profundidad 1e−6.

**Objeto** (maleza, piedra, rama):
- Sprite: `Maps/springobjects`, índice `SpriteIndex` de `Data/Objects`, rectángulo `(i mod 24 · 16, ⌊i/24⌋·16, 16, 16)`, en `(tx·64, ty·64)`.
- Profundidad: `(ty·64+32)/10000` si bloquea el paso, `ty·64/10000` si se puede atravesar. La maleza, las piedras y las ramas bloquean.
- Sombra estándar centrada en `(tx·64+32, ty·64+55)`, profundidad `((ty+1)·64)/15000`.

**Grupo de recursos:** desde `Maps/springobjects`, rectángulo del índice con `ancho·16 × alto·16`, en `(tx·64, ty·64)`. Profundidad `((ty+1)·64)/10000 + tx/100000`. Caja de `ancho × alto` tiles, que no se atraviesa.

**Colisión con el granjero:** además de las reglas de tiles, la caja choca si se superpone estrictamente con la caja de un árbol, arbusto, objeto o grupo de recursos que no se pueda atravesar.

**Profundidad del granjero** (`Farmer.getDrawLayer`): `centroY_caja/10000`. Se ordena en el lote 3 junto con los tiles de `Front`. Si su sombra va "sobre edificios", usa la misma profundidad menos 10⁻⁶.

**Pasto** (`Grass.setUpRandom`, `loadSprite`, `draw`):
- **Azar:** cada mata usa `CreateRandom(IDdePartida, díasJugados/28, x·7, y·11, 0)`, que cambia cada 28 días. Se sortean 4 entradas, cada una en este orden: `whichWeed = Next(3)`, `off1..off4 = Next(−2,3)` (a `off2` y `off4` se les resta 7 si hay un tile `Front`), `flip = NextBool` y un `NextDouble` para el temblor.
- **Origen:** el rectángulo es `(whichWeed·15, desplazamiento, 15, 20)` de `TerrainFeatures/grass`. El desplazamiento es 0/20/40 en el tipo 1, y en invierno 80 al aire libre o 0 bajo techo; 60/80/100 en los tipos 2/3/4; 160/180/200/220 en el tipo 7; y `(tipo+1)·20` en el resto.
- **Posición:** las matas `i < numberOfWeeds` (3 al generarse) se ubican en `tile·64 + ((i mod 2)·32 + off3·4 + 26, ⌊i/2⌋·32 + off4·4 + 40)`, con origen `(7,5; 17,5)` a escala 4.
- **Profundidad:** `(y − 4)/10000 + x/10⁷`.

Los árboles frutales nunca aparecen en mapas base (ningún mapa usa `SpawnTree`), así que su dibujo queda pendiente sin afectar a una partida nueva. También quedan pendientes los objetos y muebles iniciales de otras fuentes (por ejemplo los de la casa) y el forraje (`<estación>_Objects`).

## Spec S4: agua animada

Fuente: `GameLocation.loadMap`, `updateWater`, `drawWater`, `drawWaterTile`, `resetSharedState` y `Beach.resetSharedState`.

**Tiles de agua.** Solo hay capa de agua si la location es exterior, tiene la propiedad `indoorWater`, o es `Sewer` o `Submarine`; nunca en `Desert`. Un tile es agua si su tile de `Back` tiene la propiedad `Water` con cualquier valor. Con el valor `I` es agua pero no se dibuja.

**Estado por location** (`updateWater`, una vez por tick con `ms = 16`):
- `timer −= ms`; si `timer ≤ 0`, `índice = (índice + 1) mod 10` y `timer = 200`.
- `posición += 0,1` en `Farm`; en el resto, `posición += (sin(msDelSegundo/1000) + 1) · 0,15`, donde `msDelSegundo` es la parte de milisegundos (0–999) del tiempo total de juego.
- Si `posición ≥ 64`: `posición −= 64` y se invierte `flip`.

**Dibujo** (después de `Back`, antes de las sombras y `Buildings`). Para cada tile visible de agua, sea `p = ⌊posición⌋` y `fila(n) = (n mod 2 ≠ 0) ≠ flip ? 128 : 0`:
- El tile es "borde superior" si es la primera fila del mapa o el de arriba no es agua, y "borde inferior" si es la última fila o el de abajo no es agua.
- Dibujo principal desde `LooseSprites/Cursors`, rectángulo `(índice·64, 2064 + fila(x+y) + (sup ? p : 0), 64, 64 − (sup ? p : 0))`, en `(x·64, y·64 − (sup ? 0 : p))`.
- Si es borde inferior, además `(índice·64, 2064 + fila(x+y+1), 64, 64 − ⌊64 − posición⌋ − 1)` en `(x·64, (y+1)·64 − p)`.
- Se dibuja a escala 1 (los cuadros de agua de `Cursors` ya miden 64 px), teñido con el color del agua.

**Color del agua** (`resetSharedState`), con alfa 50 %: primavera (120,200,255), verano (60,240,255), otoño (255,130,200), invierno (130,80,255). En `Beach`, en verano de los días 12 a 14, (0,255,0) al 40 %. Son pendientes los colores propios de `Sewer`, `Caldera`, `MineShaft`, `VolcanoDungeon` e `IslandFarmCave`.

## Spec S5: apariencia del granjero (`FarmerRenderer`)

Fuente: `Farmer..ctor`, `GetDisplayShirt`, `GetShirtColor`, `IsOverridingPants`, `GetPantsColor`, `FarmerRenderer.executeRecolorActions`, `_GeneratePixelIndices`, `_SwapColor`, `ApplySkinColor`, `ApplyEyeColor`, `ApplyShoeColor`, `ApplySleeveColor`, `changeBrightness`, `draw` y `drawHairAndAccesories`.

**Apariencia por defecto de un granjero nuevo:** hombre, piel 0, pelo 0 de color (193,90,50), ojos (122,68,52), camisa `1000`, pantalón `0` de color (46,85,183), zapatos `2`, sin accesorio, barba ni sombrero. Si `shirt` o `pants` no son `"-1"`, se dibuja esa prenda de `Data/Shirts` o `Data/Pants`. El color de la camisa es su `DefaultColor`, o blanco si no tiene; el del pantalón es `pantsColor`.

**Recoloreo de la textura base.** Se trabaja sobre una copia de `farmer_base` (`farmer_girl_base` si es mujer). Los colores de referencia son píxeles de esa textura con índice lineal `i` (`x = i mod ancho`, `y = ⌊i/ancho⌋`): todos los píxeles de la textura con exactamente ese color (RGBA) se reemplazan.
- **Ojos:** 276 ← ojos y 277 ← `changeBrightness(ojos, −75)`. Si quedan iguales, a 277 se le suma 10 al azul. `changeBrightness` suma el valor a R y G, y a B le suma `valor·8/7` si es negativo, todo acotado entre 0 y 255.
- **Piel:** 260/261/262 ← los 3 píxeles de la fila `skin` de `skinColors` (3×24). Si `skin < 0` se usa la última fila; si se pasa del máximo, la 0.
- **Zapatos:** 268–271 ← los 4 píxeles de la fila `shoes` de `shoeColors` (4×19), acotada a la última; si no es un número, se usa la 12.
- **Mangas:** 256/257/258. Si la camisa tiene mangas, con `s` = índice del sprite de la camisa y `W` = ancho de `shirts`, la base es `⌊s·8/128⌋·32·W + (s·8 mod 128) + 4W`. La muestra `k` (0, 1, 2) es el píxel `base + 128 − k·W` (mitad teñible) multiplicado por el color de la camisa. Si ese píxel no es opaco, se usa `base − k·W` sin teñir, y desde ahí el tinte queda en blanco. Si no tiene mangas, se usan los colores de la piel.

**Capas** (todas con la misma posición y origen que el cuerpo; `fx` y `fy` son `featureX/YOffsetPerFrame[frame]`; las posiciones son relativas a la esquina del sprite del cuerpo, en píxeles de textura):

| Orden | Capa | Origen | Posición |
|---|---|---|---|
| 2 | Cuerpo | textura recoloreada, rectángulo del frame | (0,0) |
| 3 | Pantalón | `pants`, rectángulo del frame + `((p mod 10)·192, ⌊p/10⌋·688)` (+96 si es mujer), teñido con `pantsColor` | (0,0) |
| 6 | Camisa | `shirts (s·8 mod 128 , ⌊s·8/128⌋·32 + off, 8, 8)`, con `off` = abajo 0 / derecha 8 / izquierda 16 / arriba 24, en blanco | (4+fx, 14+fy) |
| 6′ | Camisa (tinte) | el mismo rectángulo +128 en X, teñido con el color de la camisa | (4+fx, 14+fy) |
| 8 o 14 | Brazos | textura recoloreada, rectángulo del frame + 96 px. Van en la capa 8 si mira arriba, 14 si no | (0,0) |
| 10 | Pelo | `hairstyles (h·16 mod 128, ⌊h·16/128⌋·96 + off, 16, 32)`, con `off` = abajo 0 / derecha 32 / izquierda 32 espejado (96 si tiene sprite izquierdo propio) / arriba 64, teñido con el color de pelo | (fx, fy+1+aj), con `aj = −1` si es hombre con pelo ≥ 16, `+1` si es mujer con pelo < 16, y 0 en otro caso |

La camisa no se espeja (tiene sprite izquierdo propio). El pelo se espeja a la izquierda. El cuerpo y los brazos se espejan según el frame.

Pendiente: parpadeo de ojos, accesorios y barba (capa 7 u 11), sombreros, estilos de pelo con `HairData`, ropa prismática y traje de baño.

## Spec S6: reloj, calendario, iluminación y HUD

Fuente: `Game1.UpdateGameClock`, `performTenMinuteClockUpdate` (lambda), `getStartingToGetDarkTime`, `getTrulyDarkTime`, `getModeratelyDarkTime`, `isTimeToTurnOffLighting`, `updateWeatherIcon`, `DrawLighting`, `DrawLightmapOnScreen`, `allocateLightmap`, el constructor de `Game1` (`lightingBlend`), `GameLocation._updateAmbientLighting`, `resetLocalState`, `addLightGlows`, `switchOutNightTiles`, `LightSource` (`.ctor`, `Draw`, `loadTextureFromConstantValue`), `DayTimeMoneyBox` (`draw`, `drawMoneyBox`, `updatePosition`, `.ctor`), `MoneyDial.draw`, `Utility.drawTextWithShadow`, `FarmHouse.AddStarterFurniture`, `GetPlayerBed`, `BedFurniture` (`GetBedSpot`, `DoesTileHaveProperty`, `UpdateBedTile`, `IntersectsForCollision`, `ShiftPositionForBed`) y `GameLocation.performTouchAction` (`Sleep`).

**Reloj.** La hora es un entero `hhmm` que empieza en 600. Mientras el tiempo corre, cada tick suma sus milisegundos enteros (16) a `gameTimeInterval`. Cuando el intervalo supera `7000 + ExtraMillisecondsPerInGameMinute·10` de la location, pasa una actualización de diez minutos:
- El intervalo vuelve a 0 y la hora suma 10. Si los minutos llegan a 60, se pasa a la hora siguiente (`h·100 + 100`). La hora nunca supera 2600.
- Si la hora es `trulyDark − 100`, se cambian los tiles nocturnos de la location actual (`NightTiles`).
- Si no, y la hora es `moderatelyDark` en un exterior sin lluvia, la luz ambiente pasa a blanco. Esta rama nunca se ejecuta, porque `moderatelyDark` siempre es igual a `trulyDark − 100`.
- A las 2400 el reloj tiembla 2 s y aparece el mensaje «It's getting late...» (`Strings/StringsFromCSFiles:Game1.cs.2652`). A las 2500 vuelve a temblar.
- A las 2600 el granjero se desmaya y empieza un día nuevo.

**Oscuridad.** `startDark` es 1800 en primavera y verano, 1700 en otoño y 1500 en invierno; en la isla siempre 1800. `trulyDark = startDark + 200` y `moderatelyDark = (startDark + trulyDark)/2`. Las luces de ventana se apagan desde `trulyDark − 100`.

**Luz exterior** (se recalcula cada tick). Sea `t = int(h·100 + (minutos/10)·16,66)`, con la división entera, y `f = intervalo/7000·16,6`:
- Desde `trulyDark`: `luz = min(0,93; 0,75 + (t − trulyDark + f)·0,000625)`.
- Desde `startDark`: `luz = min(0,93; 0,3 + (t − startDark + f)·0,00225)`.
- En ambos casos `outdoorLight = color·luz`, donde el color es `eveningColor` (255,255,0) o la luz ambiente si llueve. Multiplicar un color por un escalar trunca los cuatro canales, alfa incluido.
- Antes del anochecer, `outdoorLight` es la luz ambiente (×0,3 si llueve).

**Luz ambiente** (`_updateAmbientLighting`, al entrar y en cada actualización):
- Exterior: blanco, o (255,200,80) si llueve.
- Interior, desde `startDark` o con `lightLevel > 0`: interpolación de `indoorLightingColor` (100,120,30) a `indoorLightingNightColor` (150,150,30). El factor es `x = 1 − clamp(minutos(ahora → trulyDark)/120, 0, 1)`, con `ahora = hora + ⌊intervalo/(700 + extra)⌋`, y cada canal se trunca a byte.
- Interior, en otro caso: `indoorLightingColor`.

**Lightmap.** Se dibuja si (exterior y `outdoorLight ≠ blanco`) o `ambientLight ≠ blanco`. Con `q = lightingQuality/2 = 4`, el lightmap mide `⌊(ancho + 64)/q⌋ × ⌊(alto + 64)/q⌋` y se arma así:
1. Se limpia a transparente y se pinta con mezcla no premultiplicada de un color `C`. `C` es `outdoorLight` si `ambientLight` es blanco o si es un exterior con lluvia, y `ambientLight` en otro caso. Así cada canal guardado vale `C·C.a`.
2. Cada fuente de luz se dibuja con su textura entera en `posiciónEnPantalla/q`, con origen en su centro, escala `radio/q`, muestreo por punto y color negro por defecto. Con mezcla no premultiplicada el negro deja `destino·(1 − alfa)`: las luces abren huecos en el lightmap.
3. El lightmap se escala ×q con filtro lineal y se aplica sobre la pantalla con `lightingBlend`: función `ReverseSubtract`, origen `SourceColor` y destino `One`. Resultado: `pantalla − L²` por canal. Va después de `AlwaysFront` y del clima, y antes del HUD. En exteriores con lluvia se agrega encima un velo `OrangeRed·0,45`.

**Fuentes de luz al entrar a una location** (`resetLocalState`):
- `Light` del mapa: tripletas `x y tipo`, en el centro del tile (`x·64+32, y·64+32`), radio 1 y contexto `MapLight`.
- Solo si todavía no es hora de apagar las luces y no llueve:
  - `WindowLight`: tripletas iguales a las de `Light`, con contexto `WindowLight`.
  - Brillos interiores (`lightGlows`): tipo 6 (`indoorWindowLight`), radio 1 y contexto `WindowLight`.
- Una luz `WindowLight` que se dibuja con lluvia o pasada la hora de apagar empieza a desvanecerse: el alfa de su color baja 4 por frame y deja de dibujarse en 0.
- Texturas por tipo: 1 `lantern`, 2 `windowLight`, 4 `sconceLight`, 5 `greenLight` (`cauldronLight`), 6 `indoorWindowLight`, 7 `projectorLight`, 8 `fishTankLight`, 9 `treeLights`, 10 `pinpointLight`, todas en `LooseSprites/Lighting`. El 3 no tiene textura.

**Tiles de día y noche:**
- `DayTiles` (cuaternas `capa x y índice`) se aplica en interiores al empezar el día, si todavía no es `trulyDark − 100`. Además agrega un brillo en `tile·64 + d`, con `d` según el índice: 256 → (32,64); 257 → (32,−4); 405 → (32,32) y (96,32); 469 → (32,36); 1224 → (32,32).
- `NightTiles` (mismo formato) se aplica al entrar si ya es `trulyDark − 100` o llueve (salvo `SandyHouse`), y a esa hora en la location actual. Borra los brillos, salvo en `MineShaft` y `Woods`. Los índices 720 y 726 no se aplican si existe la mejora de la casa de Pam.

**Calendario.** Hay 28 días por estación en el orden primavera, verano, otoño e invierno; después de invierno sigue primavera del año siguiente. `dayOfWeek = día mod 7`, con los nombres de `Game1.cs.3042`–`3048`: 0 = Sun, 1 = Mon, …, 6 = Sat. Cada día nuevo suma 1 a `daysPlayed`.

**Ícono de clima:** nieve 7, lluvia 4, viento en primavera 3, en otoño 6 y en invierno 7, boda 0, sol 2, tormenta 5, festival 1, lluvia verde 999.

**HUD (`DayTimeMoneyBox`).** Coordenadas de UI, escala ×4. La posición es `(anchoUI − 300, 8)`. Si el exterior es más chico que la pantalla, se acota a `−viewport.X + anchoMapa·64 − 300`. Todo se dibuja desde `LooseSprites/Cursors`:
- Caja: `(333,431,71,43)` en la posición.
- Fecha: `"<díaCorto>. <día>"` en `dialogueFont` (`Fonts/SpriteFont1`) con sombra. Va centrada en `(333·0,5625 − ancho/2, 431·0,1 − alto/2)` respecto de la caja, en color `textColor` (34,17,34).
- Estación: `(406, 441 + 8·índiceEstación, 12, 8)` en +(212,68). Clima: `(317 + 12·ícono, 421, 12, 8)` en +(116,68); la lluvia verde usa `Cursors_1_6 (243,293,12,8)`.
- Hora: en inglés, `h mod 12` (0 → «12») + `":"` + minutos (con un «0» extra si son 0) + `" "` + `am`/`pm` (`DayTimeMoneyBox.cs.10370/10371`). Es `am` antes de 1200 y desde 2400. Va centrada en `(333·0,55 − ancho/2, 431·0,31 − alto/2)`.
  - Color `textColor`, rojo desde 2400, y a la mitad de alfa cuando el tiempo no corre (parpadea cada segundo).
  - Si el reloj tiembla, se suma `Random.Next(−2,3)` a cada eje.
- Aguja: `(324,477,7,19)` en +(88,88), con origen (3,17) y rotación `π + min(π, (t + f − 600)/2000·π)`.
- Dinero: caja `(340,472,65,17)` en +(28,172). Hay 8 dígitos en +(68,196), separados 24 px, cada uno `(286, 502 − 8·dígito, 5, 8)` en color `Maroon`. Los ceros a la izquierda no se dibujan; el último dígito siempre.

**Texto con sombra** (`drawTextWithShadow` con `dialogueFont`). El texto se dibuja tres veces: en (−3,+3) y en (0,+3) con `textShadowDarkerColor` (221,148,84), y después en (0,0) con el color pedido. Con `smallFont` o en ruso, alemán o coreano, el desplazamiento es (−2,+2). `SpriteFont` sigue la disposición de MonoGame:
- El primer glifo de cada línea arranca en `max(LSB,0)`. Los siguientes, en `x + spacing + LSB`. Después de cada glifo se suma `ancho + RSB`.
- El glifo se dibuja en `x + cropping.X, y + cropping.Y`.
- `MeasureString` mide el máximo de `x + max(RSB,0)` por línea, y el alto es `líneas·lineSpacing` (con la última línea tan alta como su glifo más alto).

**Cama y sueño.** La casa nivel 0 empieza con una cama `2048` (`Data/Furniture`: 2×4, caja 2×3) en el tile (9,8). Su lugar para dormir es `(x+1, y+1)`.
- **Colisión de la cama:** la fila superior y desde la tercera hacia abajo. La fila del medio es transitable.
- **Tile de sueño:** la fila `y+1`, en la columna `x + bedTileOffset`. `bedTileOffset` vale 0 si el granjero está a la derecha del centro de la cama y 1 si no. Pisar ese tile, si el tiempo corre y el granjero se movió desde que despertó, pregunta «Go to sleep for the night?» (`Strings/Locations:FarmHouse_Bed_GoToSleep`) con sí/no.
- **Al despertar:** en el lugar para dormir ×64. Si el tile `(x−1, y+1)` está libre, se corre 64 px a la izquierda y mira a la derecha; si no, mira a la izquierda. Después suma 32 a Y.
- La caja de pregunta definitiva llega con el sistema de diálogo (hito 6).

## Hito 3: resultados (2026-10-21)

- Reloj con paso fijo (`src/world/clock.ts`): actualización de diez minutos, temblor del reloj a las 2400 y 2500, y desmayo a las 2600.
- Iluminación (`src/render/lighting.ts`): lightmap a ¼ de resolución, con luces que abren huecos y composición `pantalla − L²` mediante un blend mode propio de WebGL. En una captura del interior, de día a noche el piso pasó de (196,86,53) a (147,54,53): Δ = (−49,−32,0), exactamente lo que da la fórmula.
- Fuentes de luz (`src/world/lights.ts`): `Light`, `WindowLight`, `DayTiles`/`NightTiles` con brillos, y desvanecimiento de las luces de ventana.
- HUD (`src/render/hud.ts`): `SpriteFont` propio con la disposición de MonoGame (`src/render/spritefont.ts`), fecha, hora con sombra, íconos, aguja y dinero.
- Cama inicial de la casa con dibujo en dos capas, colisión, pregunta para dormir, fundido y despertar en la cama del día siguiente. La fecha se guarda en la partida.
- Parámetro de desarrollo `?time=hhmm`.

Clima (spec S7): GSQ, pronóstico diario, lluvia, nieve y viento dibujados, efecto en la luz y parámetro `?weather=`. Pendiente del hito: rayos de tormenta (`performLightningUpdate`), sonido ambiente, el resto de los muebles iniciales, el sprite del granjero acostado, el menú de envíos al dormir y la caja de diálogo definitiva.

## Spec S7: clima y GameStateQuery

Fuente: `Game1.UpdateWeatherForNewDay`, `getWeatherModificationsForDate`, `ApplyWeatherForNewDay`, `LocationWeather.UpdateDailyWeather`, `Utility.isGreenRainDay`, `isFestivalDay`, `TryGetPassiveFestivalDataForDay`, `TryCreateIntervalRandom`, `CreateDaySaveRandom`, `HashUtility.GetDeterministicHashCode`, `GameStateQuery` (`Parse`, `CheckConditions`, `CheckConditionsImpl`, `Helpers.RandomImpl` y los resolvers usados), `Game1.drawWeather`, `updateWeather`, `updateRaindropPosition`, `randomizeRainPositions`, `populateDebrisWeatherArray`, `updateFloatingObjectPositionForMovement` y `WeatherDebris`.

**GameStateQuery:**
- Las condiciones se separan por comas fuera de comillas. Cada una se separa por espacios, también respetando comillas.
- Un `!` inicial niega la condición. Vacío o `TRUE` es verdadero; `FALSE` es falso.
- Una consulta desconocida hace falso todo el conjunto. Un error de argumentos cuenta como `false` y después se aplica la negación.

Resolvers implementados:
- `SEASON_DAY`: pares estación/día.
- `DAY_OF_MONTH`: números, `even` u `odd`.
- `DAYS_PLAYED min [max]`, `SEASON`, `YEAR min [max]`.
- `RANDOM p [@addDailyLuck]`: `NextDouble() < p`, con el generador del contexto.
- `SYNCED_RANDOM intervalo clave p`:
  - El generador es `CreateRandom(hash(clave), uniqueId, valor)`, donde `valor` según el intervalo es: `tick` → ticks, `day` → `daysPlayed`, `season` → `hash(estación+año)`, `year` → `hash("year"+año)`.
  - `hash` es xxHash32 con semilla 0 sobre los bytes UTF-8, leído como int32.
- `SYNCED_SUMMER_RAIN_RANDOM`: `CreateDaySaveRandom(hash("summer_rain_chance"))`, que es `CreateRandom(daysPlayed, ⌊uniqueId/2⌋, …)`, comparado contra `0,12 + día·0,003`.
- `IS_GREEN_RAIN_DAY`: si mañana es día de lluvia verde. Solo en verano: `CreateRandom(año·777, uniqueId)` elige uno de los días `[5,6,7,14,15,16,18,23]`, un arreglo estático que se extrae del DLL al importar.
- `ANY` y `TRUE`/`FALSE`.

**Día nuevo.** Primero se avanza la fecha. El pronóstico guardado pasa por `getWeatherModificationsForDate`, en este orden:
1. Sol si es día 1 o `daysPlayed ≤ 4`.
2. Lluvia si `daysPlayed = 3`.
3. `GreenRain` si toca.
4. Tormenta en verano los días múltiplos de 13.
5. `Festival` si hay festival.
6. Sol si hay un festival pasivo del valle (`MapReplacements` en una location del valle) que cumple su condición.

El resultado es el clima de hoy. Después se calcula el de mañana:
- `Festival` si mañana hay festival.
- Sol si mañana hay un festival pasivo del contexto.
- Si no, el `Weather` de la primera `WeatherConditions` del contexto (`Data/LocationContexts`) cuya condición se cumple **hoy**.

Banderas: `Rain` → lluvia; `Storm` → lluvia y rayos; `Wind` → viento con hojas; `Snow` → nieve; `GreenRain` → lluvia verde. `Desert` e `Island*` tienen su propio contexto; por ahora, sol.

**Efectos de la lluvia en la luz:** luz ambiente exterior (255,200,80), `outdoorLight` ×0,3, sin luces de ventana ni brillos, `NightTiles` al entrar (salvo `SandyHouse`), y un velo `OrangeRed·0,45` = (114,31,0) restado al cuadrado sobre la pantalla en exteriores.

**Dibujo** (solo en exteriores, después de `AlwaysFront` y antes del lightmap):
- **Lluvia:** 70 gotas en coordenadas de pantalla. Arrancan con posición, frame (0–3) y acumulador (0–69) al azar.
  - Con frame 0, cada 70 ms la gota `i` avanza `(−16 + ⌊8i/70⌋, 32 − ⌊8i/70⌋)` y con probabilidad 0,1 empieza a salpicar. Si se va por abajo (más de alto + 64), vuelve a −64.
  - Al salpicar, avanza un frame cada más de 70 ms y, al volver a 0, reaparece en un lugar al azar.
  - Textura `TileSheets/rain` en cuadros de 16×16 (frame + 4 si la lluvia es verde), a escala ×4, en blanco. La lluvia verde se dibuja dos veces en `LimeGreen`.
  - Cuando la cámara se mueve, las gotas se desplazan en sentido contrario y dan la vuelta por los bordes.
- **Nieve:** baldosas de `Cursors (368 + ⌊(t mod 1200)/75⌋·16, 192, 16, 16)` cada 64 px desde `−64 + snowPos mod 64`, a escala ×4,001 y con blanco·0,8. `snowPos` se mueve al revés que la cámara.
- **Viento:** entre 16 y 63 partículas `WeatherDebris`.
  - Tipo según la estación: primavera 0, verano 1, otoño 2, invierno 3. Rectángulos: `(352,1200)`, `(352,1184)`, `(352,1216)` de 16×16, o `(391+4k, 1236)` de 4×4. Se dibujan a escala ×3.
  - Velocidad inicial `dx = rand(−10,0)/50` y `dy = rand(10)/50`. Se mueven `dx + globalWind` y `dy + 0,5` por tick.
  - Hay ráfagas y una animación de 11 cuadros con rebotes.
  - `globalWind` vale −0,25. En otoño, con probabilidad 0,001 arranca una ráfaga que crece ×1,02 hasta −5 y después vuelve a −0,5 a razón de 0,015 por tick.

**Ícono del HUD:** sale de las banderas (ver S6).

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
