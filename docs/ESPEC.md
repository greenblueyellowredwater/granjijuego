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
| 4 | Granja básica: azada, regadera, HoeDirt, cultivos, inventario, shipping | **hecho** en lo básico (spec S8) |
| 5 | GameStateQuery, ItemQuery, tiendas, máquinas | |
| 6 | NPCs: schedules, pathfinding, diálogo, regalos | **en curso** (spec S9): horarios, rutas, dibujo y diálogo diario; faltan regalos, animaciones de horario y eventos de corazón |
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

## Spec S8: granja básica (herramientas, tierra, cultivos, edificios y envíos)

Fuente: `Farmer.initialTools`, `FarmHouse.AddStarterGiftBox`, `Toolbar.draw`, `IClickableMenu.drawTextureBox`, `Tool/Object/MeleeWeapon.drawInMenu`, `Item.DrawMenuIcons`, `Utility.drawTinyDigits`, `Tool.beginUsing`, `Tool.endUsing`, `Tool.Update`, `FarmerSprite.animateOnce`, `currentAnimationTick`, `getAnimationFromIndex` (casos 160–191), `AnimationFrame..ctor`, `Game1.drawTool`, `FarmerRenderer.GetLayerDepth`, `Character.GetToolLocation`, `Hoe.DoFunction`, `GameLocation.makeHoeDirt`, `HoeDirt` (`DrawOptimized`, `updateNeighbors`, `populateDrawGuide`, `dayUpdate`), `GameLocation.DayUpdate` y `GetDirtDecayChance`, `Crop` (`.ctor`, `newDay`, `updateDrawMath`, `getSourceRect`, `harvest`), `Object.performToolAction`, `cutWeed`, `GameLocation.OnStoneDestroyed`, `breakStone`, `Farm.AddDefaultBuildings` y sus ubicaciones, `Building` (`draw`, `drawShadow`, `getSourceRect`), `Data/Buildings`, `ShippingBin` (`initLid`, `leftClicked`, `doAction`), `Object.sellToStorePrice` y `Game1.drawHUD` (barra de energía).

**Inventario inicial:** hacha, azada, regadera, pico y guadaña `(W)47`, en 12 casilleros. En la casa hay una caja de regalo en (3,7) (`FarmHouseStarterSeedsPosition` de la granja) con 15 semillas de chirivía `(O)472`. Se dibuja desde `LooseSprites/Giftbox (0, 32·índice, 16, 32)` en `(x·64, y·64−52)`, con una sombra ×5 en +(16,53).

**Toolbar:**
- Va abajo, salvo que el jugador esté por debajo de la mitad de la pantalla + 64; en ese caso va arriba (y = 112).
- Caja `drawTextureBox(MenuTiles (0,256,60,60))` de 800×96 en `(anchoUI/2 − 400, y − 104)`. El 9‑slice usa esquinas de ancho/3.
- Casilleros `MenuTiles` tile 10, o 56 si está elegido, en `(anchoUI/2 − 384 + 64i, y − 88)`. Etiquetas «1…0 - =» con `tinyFont` en `DimGray`.
- Los ítems se dibujan con origen en su centro, en +(32,32), a escala 4·s (s = 0,9 si está elegido, 0,8 si no). Los objetos llevan sombra (`shadow` ×3 a 0,5 de alfa en +(32,48)).
- La pila se dibuja con dígitos `Cursors (368+5d, 56, 5, 7)` a escala 3s y la calidad con estrellas `(338+8(q−1), 400)` o `(346,392)`.

**Uso de herramientas** (botón C o clic izquierdo; con el mouse vale cualquier tile a un tile del jugador). Las herramientas básicas animan al soltar. Hay tres secuencias:
- **Golpe** (`animateOnce` con frames 160/168/176/184): abajo 66(150), 67(40, barrido), 68(40, **usa la herramienta al empezar**), 69(170+30·poder), 70(75). Derecha e izquierda (espejado) 48(100), 49, 50, 51(220+30p), 52. Arriba 36, 37, 38, 63, 62.
- **Riego** (frames 164/172/180/188): 54/58/62 durante 0 y 75 ms, luego 55/59/63 durante 100 ms (**usa al terminar**), luego 25/45/46 durante 500 ms. A los lados y arriba, ese último frame usa el brazo secundario (columna de brazos +12 en vez de +6).
- **Avance:** el frame avanza cuando el temporizador supera su duración, en ticks de 16 ms.
- **Sprite de la herramienta:** se toma de `TileSheets/tools` como `(i·16 mod ancho, ⌊i·16/ancho⌋·16, 16, 32)`, con `i = SpriteIndex` + desplazamiento.
  - Desplazamiento: abajo +0 (+1 desde el frame 2), arriba +3 (+4 desde el frame 1), costados +2. La regadera básica usa +4 arriba, +2 a los costados y +0 abajo.
- **Posición y rotación:** las de `Game1.drawTool` para cada dirección y frame (tabla en `src/world/tools.ts`), con origen (0,16) o (0,32) y espejado a la izquierda.
- **Profundidad de la herramienta:** la del granjero +1e‑6 mirando arriba, +15e‑6 abajo y +0,0032 a los costados. Las capas del granjero van a +k·1e‑6.
- **Tile objetivo con teclado:** a 48 px del borde de la caja del granjero, en la dirección en que mira.
- **Energía:** cada uso cuesta `2·poder − nivel·0,1`; la guadaña no gasta. La regadera tiene 40 de agua, gasta 1 por uso y se rellena en el agua.

**Azada.** Si el tile del `Back` es `Diggable`, está libre y es transitable, se crea `HoeDirt` (regado si llueve en un exterior), con la animación de tierra `animations` fila 12, 8 cuadros de 50 ms.

**HoeDirt:**
- Se dibuja con `hoeDirt`, `hoeDirtDark` (Mountain/Mine) o `hoeDirtSnow` (invierno).
- El tile se elige con la máscara de vecinos (N=1, E=2, S=4, O=8) y la tabla `{0:0, 8:15, 2:13, 1:12, 4:4, 9:11, 3:9, 5:8, 6:1, 12:3, 10:14, 7:5, 15:6, 13:7, 11:10, 14:2}`. El rectángulo es `(p mod 4·16, ⌊p/4⌋·16)`.
- Si está regado se agrega otra capa con +64 en X y máscara de vecinos regados. Profundidades 1e‑8 y 1,2e‑8.

**Día nuevo:**
1. Cada cultivo crece si su tierra estaba regada.
2. La tierra se seca.
3. La tierra vacía desaparece con probabilidad `DirtDecayChance`: 0,1 en la granja, 0 en el invernadero, 1 en el resto.
4. Si hoy llueve, se riega toda la tierra exterior.

**Cultivos** (`Data/Crops`, por id de semilla):
- **Plantar:** solo en tierra sin cultivo y en temporada (si no, aparece «Out of season.»). `phaseDays = DaysInPhase + [99999]`, `flip` al azar.
- **Crecimiento:** sube `dayOfCurrentPhase` hasta el largo de la fase y pasa a la siguiente; las fases de 0 días se saltean. Fuera de temporada (exterior) el cultivo muere; en invierno se destruye.
- **Dibujo:**
  - Rectángulo `(min(240, col·16 + (fila impar ? 128 : 0)), ⌊fila/2⌋·32, 16, 32)`, con `col = fase + 1`. En la fase 0, `col = 0` si `7x + 11y` es par. Si está maduro y vuelve a crecer, `col` es 6 o 7.
  - Se dibuja con origen (8,24) en `(x·64+32, y·64+32+jy)`, con `jy = (11y+7x) mod 10 − 5` mientras crece, y profundidad `(y·64+32)/10000`.
- **Cosecha** (botón de acción): calidad con `CreateRandom(7x, 11y, daysPlayed, uniqueId)`: oro con `0,2·(nivel/10) + 0,01` y plata con el doble (máx. 0,75); también la cantidad por datos. Si `RegrowDays > 0` queda maduro con esos días; si no, se elimina con las animaciones 17 y 14.

**Escombros.** Piedra (`Stone`, cat. −999) con pico, rama (`Twig`) con hacha, yuyos (`*Weeds*`) con azada, hacha, pico o guadaña. Sueltan:
- Piedra: 390 × (1–2) (`breakStone`, sin bonos de nivel).
- Rama: madera 388.
- Yuyos: fibra 771 con probabilidad 0,5.

Los objetos sueltos rebotan y, a menos de 128 px, vuelan al granjero y entran al inventario. Esto es una aproximación de `Debris`.

**Edificios de la granja** (`Farm.AddDefaultBuildings`):
- **Ubicación:** casa en `FarmHouseEntry − (5,3)` (por defecto (64,15)), invernadero en `GreenhouseLocation` o (25,10), caja de envíos en (71,14) y bebedero en (53,7).
- **Dibujo:** cada edificio va en `(x·64, (y+alto)·64) + DrawOffset·4`, con origen abajo a la izquierda, escala 4 y profundidad `((y+alto)·64 − SortTileOffset·64)/10000`.
  - Sombra: `Cursors (656|672|688, 394)` a lo ancho del borde inferior.
  - `DrawLayers`: en la esquina superior + `DrawPosition·4`, con profundidad +1/10000. Las de fondo van a profundidad 0.
  - La casa usa la fila del nivel de mejora. El invernadero muestra las ruinas (y − alto) hasta tener `ccPantry`.
- **Colisión:** `CollisionMap` (`X` bloquea) o todo el rectángulo.
- **Puertas:** `HumanDoor` lleva a la casa (3,11). El invernadero roto muestra `Farm_GreenhouseRuins`.
- **Caja de envíos:** tapa `Cursors (134,226,30,25)` en `(x·64+4, (y−1)·64−28)` con profundidad `(y+1)·64/10000 + 0,0001`. Con un objeto vendible en la mano, a ≤ 2 tiles de la caja, se envía la pila entera. A la noche se cobra `⌊precio·(1 + 0,25·calidad)⌋` por unidad.

**Barra de energía:**
- Posición: `(anchoUI − 56, altoUI − 240 − (máx − 270)·0,625)`, armada con las tres piezas `Cursors (256, 408|424|448, 12, 16)`.
- Relleno de alto `energía·0,625 − 1` en `(x+12, y+48+máx·0,625 − energía·0,625)`.
- Color de rojo a verde: R = 255 si p ≤ 0,5 y si no `(1−p)·510`; G = `min(255, p·510)`. Lleva una franja superior de 4 px con R y G −50.

Pendiente: animación de la guadaña (`MeleeWeapon`), árboles con hacha, animación de cosecha (279+dirección) y de apertura del regalo, menú de envíos nocturno, experiencia y niveles, y fertilizantes.

## Spec S9: NPCs, horarios y diálogo

Fuente: `NPC.TryLoadSchedule`, `parseMasterScheduleImpl`, `pathfindToNextScheduleLocation` (cálculo de llegada), `NPC.draw`, `Character.GetBoundingBox`, `DrawShadow`, `NPC.loadCurrentDialogue`, `tryToRetrieveDialogue`, `DialogueBox` (`.ctor`, `drawBox`, `drawPortrait`, `draw`, `update`) y `SpriteText` (`.cctor`, `drawString`, `getWidthOfString`, `getWidthOffsetForChar`, `getSourceRectForChar`, `positionOfNextSpace`).

**Personajes:** los de `Data/Characters` que tienen `Home` y textura. Arrancan el día en su casa (`Home`), salvo que el horario tenga una entrada de hora 0.

**Clave del horario.** Se elige la primera que exista, en este orden:
1. `GreenRain`: año 1, día de lluvia verde.
2. Festivales pasivos: `<id>_<día>` o `<id>`.
3. `<estación>_<día>`.
4. `<día>_<corazones…1>`, luego `<día>`.
5. `bus`: solo Pam, con `ccVault`.
6. Si llueve, `rain2` con probabilidad 0,5, si no `rain`.
7. `<estación>_<díaSemana>_<c…1>`, luego `<estación>_<díaSemana>`.
8. `<díaSemana>_<c…1>`, luego `<díaSemana>`.
9. `<estación>`, `spring_<díaSemana>` y `spring`.

`díaSemana` usa los nombres en inglés fijos (`Sun`…`Sat`, día mod 7). Los corazones son `puntos/250`.

**Formato del horario.** Entradas separadas por `/` con la forma `[a]hora [location] x y [dirección] [animación] ["mensaje"]`:
- Sin location, se usa la anterior. `bed` va a la última entrada de `default` o `spring`, o a la casa.
- Una `a` delante marca hora de **llegada**: la salida se adelanta `round((píxeles/2)/420)·10` minutos.
- Directivas: `GOTO clave` (`season` para la estación, `no_schedule` para no seguir horario); `NOT friendship NPC c …` (si se cumple, usa `spring`); `MAIL id` (salta 2 entradas si la carta existe, 1 si no).

**Movimiento.**
- Al llegar la hora de una entrada, el NPC calcula la ruta: la secuencia de locations sale de un BFS sobre el grafo de warps (generado al importar desde las propiedades `Warp` y las acciones `Warp`/`LockedDoorWarp` de cada mapa), y dentro de cada location usa A* de 4 direcciones con la transitabilidad del mapa.
- Camina 2 px por tick, cambia de location al pisar el warp y al final mira hacia la dirección indicada.
- Los mapas de las demás locations se cargan a demanda.
- **Aproximaciones:** el A* no es idéntico al `PathFindController` del original, las rutas no consideran restricciones de género ni de acceso, y las animaciones de fin de ruta todavía no se reproducen.

**Dibujo.**
- Hoja 16×32, 4 cuadros por fila: abajo fila 0, derecha 1, arriba 2, izquierda 3. El paso cambia cada 175 ms.
- Posición `(x+32, y+16)`, origen (8,24), escala 4 y profundidad `(y+32)/10000`.
- Sombra en `(x+32, y+44)`. La caja de colisión es `(x+8, y+16, 48, 32)` y bloquea al granjero.

**Diálogo diario** (`Characters/Dialogue/<NPC>`):
- La primera vez se usa `Introduction`.
- Si no, con `r = CreateDaySaveRandom(díasJugados·77, 2 + casaX·77, casaY·777)` (la casa en píxeles): se consume un `NextDouble`. Si llueve y `NextBool`, se usa `Characters/Dialogue/rainy:<NPC>`.
- Si no, se prueba `tryToRetrieveDialogue("<estación>_")` y después `tryToRetrieveDialogue("")`, con `a = min(año, 2)` y este orden de claves:
  1. `<p><día>` (solo el año 1).
  2. `<p><día>_<a>` y `<p><día>_*`.
  3. `<p><díaSemana><c>_<a>` o `<p><díaSemana><c>`, para c = 10, 8, … 2 si los corazones alcanzan.
  4. `<p><díaSemana>` (o su versión `_<a>` si existe).
- `#$e#` corta el texto: cada charla del día muestra el siguiente tramo. `#$b#` separa cajas.
- `$h`/`$s`/`$u`/`$l`/`$a`/`$n` al final elige el retrato 1/2/3/4/5/n. `@` es el nombre del granjero y `^` separa la versión masculina de la femenina.
- La primera charla del día da +20 puntos de amistad. Con el diálogo abierto el tiempo no corre.

**Caja de diálogo con retrato:**
- 1200×384, centrada, con `y = altoUI − 448`.
- Marco con piezas de `Cursors` (fondo `(306,320,16,16)` estirado, bordes y esquinas ×4).
- Columna de retrato desde `x + 1200 − 444`, marco `(583,411,115,97)` ×4, y retrato `Portraits/<NPC>` (64×64, índice por emoción) en `(retX+92, y+16+…)`.
- Nombre centrado debajo y texto en `(x+8, y+8)` con ancho 716.
- Se tipea a 1 carácter cada 30 ms. Acción o clic completa el texto; con el texto completo, pasa a la caja siguiente.

**SpriteText** (`LooseSprites/font_bold`, zoom 3):
- Glifo `c`: rectángulo `((c−32)·8 mod 128, ⌊(c−32)·8/128⌋·16, 8, 16)`.
- Avance `8·3 + ajuste(siguiente)·3` más `ajuste(c)·3`. Ajustes: `,` `.` −2; `! i j l ¡ ı…` −1; `^` −8; `$` +1.
- Línea de 18·3 px. Corta antes de la palabra que no entra. Las mayúsculas suben 3 px.

## Spec S10: tiendas (`Data/Shops`, `ShopMenu`)

**Apertura**: la propiedad de tile `Action` = `Buy General` abre la tienda `SeedShop`, solo si un dueño de `Owners` está dentro del rectángulo de dueño. Para Pierre es el tile `(4,17)`, detrás del mostrador.

**Stock** (`ShopBuilder.GetShopStock`), recorriendo `Items` en orden:
- Se descarta la entrada si `Condition` es falsa (GSQ, spec S7). Las entradas con consultas de ítems (`RANDOM_ITEMS`, etc.) quedan pendientes de ItemQuery.
- Precio base:
  - Si `Price ≥ 0`, se usa `Price`.
  - Si no, el precio de venta del objeto: `Price` de `Data/Objects` ×2 (truncado, por calidad `1+0,25·q`).
  - Con `UseObjectDataPrice`, el `Price` crudo.
  - Recursos con precio fijo, año 1 / año 2+: madera 388 10/50, piedra 390 20/100, carbón 382 120/250, cobre 378 80/160, hierro 380 150/250, oro 384 350/750.
- Primero se aplican los `PriceModifiers` de la tienda según `PriceModifierMode`, salvo `IgnoreShopPriceModifiers`. Después, los del ítem en modo apilado.
  - Modo 0 apila en orden; modo 1 toma el mínimo y modo 2 el máximo entre los resultados individuales sobre el valor base.
  - Modificación 0 suma, 1 resta, 2 multiplica, 3 divide y 4 reemplaza. `RandomAmount` elige uno al azar.
- El precio final se trunca. `AvailableStock < 0` significa ilimitado.

**Menú** (en píxeles de UI):
- Ancho 1000+2·40, alto 600+2·40, centrado. Fondo negro a 0,75 sobre todo.
- Cuatro filas de alto `(alto−256)/4`, empezando en `(x+16, y+16)`, cada una con caja `(384,396,15,15)` de Cursors.
- Fila: ícono con fondo `(296,363,18,18)`, nombre en SpriteText en `x+104` y precio alineado a la derecha seguido de la moneda `(193,373,9,10)`. Si no alcanza el dinero, el precio va a media opacidad y la moneda a 0,25.
- Al pasar el mouse, la fila se resalta en trigo a 0,35.
- Inventario de 3×12 en la caja inferior derecha. Caja de dinero `(340,472,65,17)` a la izquierda, con dígitos en rojo oscuro.
- Flechas de scroll `(421,459)` y `(421,472)` a la derecha, y botón de cierre `(337,494,12,12)`.

**Interacción**:
- Clic izquierdo en una fila: compra 1 si alcanza el dinero y entra en el inventario.
- Clic en un ítem del inventario con precio: lo vende por el precio de envío (spec S8) por la pila.
- La rueda del mouse o las flechas hacen scroll de a una fila. Esc o el botón de cierre cierran el menú.
- El reloj no avanza con el menú abierto.

Aproximaciones: no hay tooltip, ni compra con Shift para varias unidades, ni diálogo del dueño, ni animación de ítem en mano.

## Spec S11: regalos y amistad

**Gusto** (`NPC.getGiftTasteForThisItem`). Valores: 0 encanta, 2 gusta, 4 disgusta, 6 odia, 8 neutral, 7 té de fruta estelar (`(O)StardropTea`, siempre).
- Universales (`Universal_Love/Hate/Like/Dislike/Neutral` de `Data/NPCGiftTastes`), en este orden y pisándose:
  1. Por categoría (número negativo como texto) en el orden encanta, odia, gusta, disgusta.
  2. Por etiqueta de contexto con el mismo orden.
  3. Por ítem explícito: encanta, odia, gusta, disgusta, neutral. Marca "explícito"; con neutral también marca "neutral explícito".
- Tipo `Arch`: disgusta, salvo Penny y Dwarf, que les gusta.
- Si quedó neutral sin ser neutral explícito:
  - Comestibilidad distinta de −300 y negativa: odia.
  - Si no, con precio menor a 20: disgusta.
- Lista personal (campos impares 1, 3, 5, 7, 9 = encanta, gusta, disgusta, odia, neutral), evaluada en orden encanta, odia, gusta, disgusta, neutral:
  1. Primero por ítem explícito, que gana sobre todo.
  2. Después por etiqueta.
  3. Por último por categoría, solo si no hubo ítem universal explícito y la categoría no es 0.
- Una entrada de lista resuelve a ítem si empieza con `(`, o si es un id de `Data/Objects` (se le antepone `(O)`). Se ignoran las que empiezan con `-`.
- Las etiquetas son entradas no vacías que no empiezan con dígito ni `-`.

**Etiquetas base** (`ItemContextTagManager.GetBaseContextTags`):
- `id_(o)<id>` y `id_o_<id>`.
- Las de `ContextTags` del objeto.
- `geode` si tiene drops de geoda y `not_giftable` si `CanBeGivenAsGift` es falso.
- `item_<nombre>` e `item_type_<tipo>`, saneados: trim, minúsculas, espacio→`_` y sin `'`.
- `category_<x>` según la tabla de categorías:
  - −2 gem, −4 fish, −5 egg, −6 milk, −7 cooking, −8 crafting, −9 big_craftable, −12 minerals, −14 meat.
  - −15 metal_resources, −16 building_resources, −17 sell_at_pierres, −18 sell_at_pierres_and_marnies, −19 fertilizer, −20 junk, −21 bait, −22 tackle.
  - −23 sell_at_fish_shop, −24 furniture, −25 ingredients, −26 artisan_goods, −27 syrup, −28 monster_loot, −29 equipment.
  - −74 seeds, −75 vegetable, −79 fruits, −80 flowers, −81 greens.
  - −95 hat, −96 ring, −97 boots, −98 weapon, −99 tool, −100 clothing, −101 trinket, −999 litter.

**Entregar** (`NPC.checkAction` → `tryToReceiveActiveObject`):
- Con un objeto `(O)` regalable en la mano, la acción sobre el NPC intenta regalar antes de hablar.
- El NPC debe estar en `NPCGiftTastes` y no tener `CanReceiveGifts` en falso.
- Rechazos, salvo con el té:
  - Con 2 regalos en la semana y sin cumpleaños: `NPC.cs.3987` ("ya le diste {0} {1} regalos esta semana").
  - Con 1 regalo hoy: `NPC.cs.3981`.
  - Los mensajes se muestran en una caja sin retrato: ancho `min(1240, ancho SpriteText + 64)`, centrada y a 64 px del borde inferior.
- Al aceptar se suma 1 a regalos de hoy y de la semana, se guarda el día del regalo y se consume 1 del ítem.

**Puntos** (`NPC.receiveGift`):
- Multiplicador de calidad: 1 → 1,1f, 2 → 1,25, 4 → 1,5; el resto, 1.
- Multiplicador de cumpleaños: ×8.
- Puntos por gusto:

  | Gusto | Puntos |
  | --- | --- |
  | Encanta | `trunc(80·m·q)` |
  | Gusta | `trunc(45·m·q)` |
  | Neutral | `20·m` |
  | Disgusta | `−20·m` |
  | Odia | `−40·m` |
  | Té | `min(750, 250·m)` |

- `changeFriendship` limita a `[0, (corazonesMax+1)·250−1]`. Los corazones máximos son 8 si es romanceable (sin noviazgo) y 10 si no.

**Reacción** (`NPC.GetGiftReaction`). Prefijo `AcceptGift` (o `AcceptBirthdayGift` en cumpleaños). Se usa el primer diálogo del personaje que exista:
1. `_<idCalificado>`.
2. `_<etiqueta>`.
3. `_<Gusto>_<etiqueta>` y luego `_<General>_<etiqueta>`.
4. `_<Gusto>` y luego `_<General>`.
5. El prefijo solo.

`<Gusto>` es Loved, Liked, Disliked, Hated o Neutral. `<General>` es Positive para encanta, gusta y neutral, y Negative para disgusta y odia.

Si no existe ninguno:
- Sin cumpleaños: el texto del campo par de `NPCGiftTastes` (0, 2, 4, 6; 8 para neutral; 0 para el té).
- En cumpleaños: frases genéricas de `StringsFromCSFiles` según modales (`Manner` 2 = grosero):
  - Positivo, con una moneda al aire: 4274/4275 o 4276/4277.
  - Negativo: 4278/4279.
  - Neutral: 4280/4281.

Emoción por defecto `$h` (encanta, gusta, té) o `$s` (disgusta, odia), si el texto no trae una.

**Nuevo día** (`Farmer.resetFriendshipsForNewDay`):
- Si no hablaste con el NPC, pierde 2 puntos salvo que ya tenga 2500 o más (2000 si es romanceable sin noviazgo).
- Después se reinicia `talkedToday`.
- `GiftsToday` vuelve a 0 si el último regalo no fue hoy.
- Si cambió la semana (`(TotalDays+1)/7`, con `TotalDays = ((año−1)·4+estación)·28 + día−1`):
  - Con 2 regalos en la semana anterior, suma +10.
  - `GiftsThisWeek` vuelve a 0.
- Charla diaria: +20 la primera vez del día.

**Emotes** (`Character.doEmote` / `updateEmote` / `NPC.DrawEmote`):
- Al regalar: encanta → 20 (corazón), odia → 12, té → 56.
- Secuencia:
  1. Abre por los cuadros 0..3 cada 20 ms.
  2. Salta al índice del emote y cicla 4 cuadros cada 250 ms.
  3. Cierra de 3 a 0 cada 20 ms.
- Solo avanza con el mundo activo (no con un menú abierto).
- Fuente `TileSheets/emotes`: cuadro `f` en `(16f mod ancho, ⌊16f/ancho⌋·16)`, 16×16, escala 4.
- Posición: `(x + EmoteOffset.x + (anchoSprite/2 − 8)·4, y + EmoteOffset.y − (altoSprite+3)·4)`. Se suman +32 si es niño o +10 si es mujer.
- Se dibuja sobre todas las capas del mapa (después de AlwaysFront).

Aproximaciones:
- Sin la animación del granjero al entregar.
- Sin celos de cónyuge ni misiones de entrega.
- Sin regalo por encima del mostrador: hace falta tener al NPC enfrente.

## Spec S12: menú del juego (`GameMenu`, `InventoryPage`, `InventoryMenu`)

**Apertura**:
- E o Esc abren el menú si no hay otro menú, diálogo, herramienta en uso, warp ni fin de día. La misma tecla lo cierra.
- Con cualquier menú activo (diálogo, pregunta, tienda o este menú):
  - El reloj no avanza.
  - La barra de herramientas no se dibuja (`Toolbar.draw` retorna si hay `activeClickableMenu`).
  - El reloj y el HUD sí se dibujan.

**Marco**:
- Tamaño 800+2·40 por 600+2·40, centrado. Fondo negro a 0,4.
- `drawDialogueBox` con `drawOnlyBox` usa `Maps/MenuTiles` con el borde desplazado 64 px hacia abajo:
  - Esquinas en `(x, y+64)`, `(x+w−64, y+64)` y las inferiores en `y+h−64`, con fuentes (0,0), (192,0), (192,192) y (0,192).
  - Bordes: arriba (128,0), abajo (128,192), izquierda (0,128) y derecha (192,128). Los laterales empiezan en `y+128` y miden `h−192`.
  - Relleno (64,128) en `(x+28, y+92, w−64, h−128)`.
- Pestañas en `x+64·(i+1), y+16`, 16×16 a escala 4. La activa baja 8 px.
  - Iconos de `Cursors` en (k·16, 368): inventario 0, habilidades 1, social 2, mapa 3, artesanía 4, colecciones 5, opciones 6, salir 7.
  - Iconos de `Cursors_1_6`: animales (257,246) y poderes (216,494).
- Botón de cierre `(337,494,12,12)` en `(x+w−36, y−8)`.

**InventoryMenu**:
- Casilla `i` en `(x + (i mod 12)·64, y + fila·64 + (fila−1)·4 − 12)`. El `−12` solo aplica en la fila 0 de un inventario de jugador.
- Fondo de casilla: tile 10 de MenuTiles. Casillas a partir de `maxItems` (12 al inicio): tile 57 a 0,5.
- En el inventario del jugador, la fila 0 lleva etiquetas `1..9 0 - =` en tinyFont, centradas encima. Van en rojo si es la herramienta actual y en gris oscuro si no.
- Los ítems usan `drawInMenu` con transparencia 1, o 0,25 si no pasan el filtro (en la tienda, los no vendibles).

**InventoryPage** (`top = y+40+96`):
- Inventario en `(x+56, top)` y partición horizontal (tiles 4, 6 estirado y 7) en `top+192`.
- Equipo, en columnas `x+48` (anillo izq., anillo der., botas) y `x+256` (sombrero, camisa, pantalón), filas `top+248/312/376`.
  - Vacíos: tiles 41, 41, 40, 42, 69 y 68. Con ítem: tile 10.
  - Camisa: rect 8×8 en `(idx·8 mod 128, ⌊idx·8/128⌋·32)` más la capa de tinte desplazada +128, con origen centrado ×4.
  - Pantalón: `(192·(idx mod 10), 688·⌊idx/10⌋+672, 16, 16)` teñido.
- Retrato:
  - Fondo `daybg` (o `nightbg` desde las 19:00) en `(x+120, top+248)`.
  - Granjero de frente, cuadro 0, en `(x+152, top+280)`.
  - Nombre centrado en `x+184`, `top+456`.
- Textos con sombra en `dialogueFont`, centrados en `x+576`: nombre de granja (`top+260`), fondos (`top+324`), ganancias totales (`top+384`) y fecha `Utility.cs.5678` (`top+448`, a 0,8).
  - Sombra: color (221,148,84) en (−3,+3) y (0,+3).
  - Las ganancias totales suman solo cuando el dinero aumenta (`Farmer.set_Money`).
- Tacho `(564,102,18,26)` en `(x + w/3 + 608, top+256)`, con tapa `(564,129,18,10)` y origen (16,10). Botón de ordenar `(162,440,16,16)` en `(x+w, y+h/3−56)`.
- Clic en una casilla:
  - Levanta el ítem, o lo intercambia con el que está en la mano.
  - Si son iguales y apilables, completa la pila.
  - Clic en el tacho: descarta lo que está en la mano.
  - Al cerrar, lo que quede en la mano vuelve a su casilla, o a la primera libre.

**Tienda**: su inventario usa el mismo `InventoryMenu`, sin `playerInventory` y con `showGrayedOutSlots`.

Aproximaciones:
- Funcionan las pestañas de inventario, habilidades (spec S15), social (spec S14), artesanía (spec S18) y salir.
- Sin mini-retrato en la pestaña de habilidades y sin botón de ordenar funcional.
- Sin la capa azul nocturna sobre el granjero, sin animación de la tapa del tacho y sin tirar ítems fuera del menú.

## Spec S13: tooltips de ítems (`IClickableMenu.drawToolTip` / `drawHoverText`)

**Contenido**:
- Título: `DisplayName`.
- Texto: descripción partida con `Game1.parseText` (smallFont) al ancho `max(272, ancho dialogueFont del nombre)`. Corta por palabra cuando `ancho(línea+palabra) > ancho`.
- Categoría:
  - Objetos: `Object.GetCategoryDisplayName`, con nombres en `StringsFromCSFiles` (Object.cs.12850–12869, Tool.cs.14307, etc.) y colores de `GetCategoryColor`.
  - Herramientas y guadaña: "Tool" en DarkSlateGray.
  - Tipo `Arch`: color (110,0,90).
- `healAmount` es la comestibilidad si es un objeto con comestibilidad distinta de −300; si no, −1.

**Tamaño** (`font` = smallFont):
- Ancho: `max(heal ≠ −1 ? ancho(heal+"+ Energy"+"32") : 0, ancho(texto), ancho_dialogue(título)) + 32`. Con categoría, también `≥ ancho(cat)+32`. Si es comestible, también `≥ ancho("9999 Energy"/"9999 Health") + 92`.
- Alto: `max(60, alto(texto) + 32 + alto_dialogue(título) + 16)`.
  - Con categoría se suma `alto("T")`.
  - Si es comestible (≠ −300 y ≠ 0) se suma `40·(energía>0 y salud>0 ? 2 : 1)`.
- Posición `(mouse + 32 + off)`, con `off` = 40 si hay un ítem en la mano.
  - Si se pasa por la derecha: `x = derecha − ancho` e `y += 16`.
  - Si se pasa por abajo: `x += 16` (re-acotado) e `y = abajo − alto`.
- Después se suma 4 al ancho.

**Dibujo**:
- Caja `MenuTiles (0,256,60,60)` en 9-slice. La sombra es la misma caja desplazada (−8,+8) en negro a 0,4, con el centro inset c/2.
- Caja del título: alto `alto_título + 32 + (cat ? alto("asd") : 0) − 4`, sin sombra. Debajo, un separador `(44,300,4,4)` en `(x+12, y+eso, ancho−24, 4)`.
- Título en `(x+16, y+20)` con sombras (+2,+2) y (0,+2) en textShadowColor.
- Después `y += alto_título`. La categoría va en `y−4` con sombras (2,2) y (0,2), y luego `y += alto("T") + 4 + 16`. Sin categoría, `y += 16`.
- Descripción en `(x+16, y+20)` con sombras (2,2), (0,2) y (2,0), en textColor·0,9.
- Comestibles: energía `+n` con ícono (0,428) y salud `+n` con ícono (0,438), solo si son mayores que 0.
  - Si la energía es negativa: ícono (140,428).
  - Íconos ×3 con sombra (−4,+4) a 0,35. Texto en `(x+54, y+16)` y 34 px por línea.
  - Fórmulas: energía `⌈e·2,5⌉ + calidad·e`; salud `trunc(energía·0,45f)` (0 si e<0).

Aproximaciones: sin estadísticas de armas, buffs, precio con el catálogo de precios ni requisitos de recetas.

## Spec S14: página social (`SocialPage`)

**Entradas** (`FindSocialCharacters`): NPCs del mundo con `CanSocialize` verdadero (GSQ). Según `SocialTab`:
- 0 (`UnknownUntilMet`): aparece como "???" sin amistad.
- 1 (`AlwaysShown`): crea la amistad.
- 2 (`HiddenUntilMet`): se omite sin amistad.
- 3 (`HiddenAlways`): se omite.

Orden:
1. Puntos de amistad de mayor a menor; los nulos van al final.
2. Orden de encuentro: el índice en `friendshipData` empezando en 1; los nulos van primero.
3. Nombre visible.

Corazones = `puntos/250`.

**Marco y filas**:
- Ancho del cuadro: 880+36. Cinco filas visibles desde `slotPosition`. La fila k tiene el sprite en `(x+44, y+104+112k)`.
- Particiones horizontales chicas (tile 25 estirado en `x+32..w−64`) en `y+172`, `y+284`, `y+396` y `y+508`.
- Particiones verticales (tile 26 en `y+96`, alto `h−128`) en `x+268`, `x+620` y `x+752`.
- Retrato: `MugShotSourceRect`, o `(0, niño?4:0, 16, 24)` de `Characters/<nombre>`, a ×4.
- Nombre en dialogueFont, centrado en `x+200`, a `y_fila + 48 − (romanceable ? 24 : 20)`. Si es romanceable, debajo va "(single)", centrado y con el fondo alineado al sprite.
- Corazones h=0..9: `Cursors (211|218, 428, 7, 6)` ×4 en `(x+316+32h, y_fila+36)`.
  - Lleno (211) si `h < nivel` o si está bloqueado.
  - Bloqueado si es romanceable sin noviazgo y h ≥ 8: negro a 0,35.
- Regalos (salvo niños):
  - Ícono `Cursors2 (166,174,14,12)` en `(x+688, y−4)` con sombra (0,+4) a 0,2.
  - Casillas `Cursors (227 / 236 marcada, 425, 9, 9)` en `x+680` (≥2 en la semana) y `x+720` (≥1), a `y+52`.
- Charla: ícono `Cursors2 (180,175,13,11)` en `(x+808, y)` y casilla en `(x+816, y+52)` según `talkedToToday`.
- Scroll:
  - Flechas en `(x+w+16, y+64)` y `(x+w+16, y+h−64)`.
  - Riel `textureBox Cursors (403,383,6,6)` ×4 de ancho 24, desde `y+116` y de alto `h−184`.
  - Barra `(435,463,6,10)`.
  - Se mueve con la rueda o las flechas.

Aproximaciones: sin entrada del granjero propio ni de otros jugadores, sin estados de pareja o casamiento, sin perfil al hacer clic y sin tooltip de cumpleaños.

## Spec S15: habilidades y experiencia

**Experiencia** (`Farmer.gainExperience`):
- Habilidades: 0 cultivo, 1 pesca, 2 recolección, 3 minería, 4 combate, 5 suerte. La suerte nunca suma.
- Umbrales por nivel: 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000.
- `checkForLevelGain(viejo, nuevo)` devuelve el nivel más alto cruzado. Cada nivel nuevo se agrega a `newLevels` como (habilidad, nivel).

**Fuentes de experiencia implementadas**:

| Acción | Habilidad | Experiencia |
| --- | --- | --- |
| Cosecha (`Crop.harvest`) | Cultivo | `round(16·ln(0,018·precio+1))` (chirivía: 8) |
| Árbol que cae (`Tree.performTreeFall`) | Recolección | 14 |
| Tocón destruido | Recolección | 2 |
| Rama rota con hacha | Recolección | 1 |
| Piedra rota (`breakStone`) | Minería | 1 |

**Efectos del nivel**:
- Energía por uso de herramienta: `2 − nivel·0,1`. Azada y regadera usan cultivo, hacha usa recolección y pico usa minería.
- Calidad de cosecha según el nivel de cultivo (spec S8).

**Nivel del granjero**: `(suma de los 6 niveles)/2`. Título (`Farmer.getTitle`, StringsFromCSFiles):

| Nivel | Clave |
| --- | --- |
| < 3 | Farmer.cs.2032 |
| 3–4 | 2031 |
| 5–6 | 2030 |
| 7–8 | 2029 |
| 9–10 | 2028 |
| 11–12 | 2027 |
| 13–14 | 2026 |
| 15–16 | 2025 |
| 17–18 | 2023 (hombre) / 2024 (mujer) |
| 19–20 | 2022 |
| 21–22 | 2021 |
| 23–24 | 2020 |
| 25–26 | 2019 |
| 27–28 | 2018 |
| 29 | 2017 |
| ≥ 30 | 2016 |

**SkillsPage** (base `bx = x+384`, `by = y+128`, filas cada 68):
- Orden de filas: cultivo, minería, recolección, pesca y combate.
  - Ícono `Cursors` 10×10: (10,428), (30,428), (60,428), (20,428) y (120,428).
  - El ícono va en `(bx−52, by−4)` con sombra en `(bx−56, by)` en negro a 0,3.
  - El nombre (`SkillsPage.cs.11604..8`) va alineado a la derecha en `bx−60`.
- Nivel i en `bx + i·36 + 24·⌊i/5⌋`:
  - Normal: `(129|137, 338, 8, 9)`, con sombra (−4, +4) y alfa 0,65 si no se alcanzó.
  - Hito (niveles 5 y 10): `(145, 338, 14, 9)` vacío a 0,65 con sombra. Alcanzado: `(159, 338, 14, 9)` en x−4, sin sombra.
- Número de nivel con `NumberSprite`: dígitos `(512 + d·8 mod 48, 128 + ⌊d·8/48⌋·8, 8, 8)` ×4 con origen (4,4), de derecha a izquierda cada 28 px. Va en SandyBrown (0,75 si es 0) con sombra negra a 0,35.
- Retrato:
  - Fondo día/noche en `(x+56, y+116)` y granjero en `(x+88, y+148)`.
  - Nombre y título en smallFont, centrados en `x+120`, a `y+311` y `y+341`.
  - Línea `(214,143,84)` de 4 px en `y + 96 + alto/2 + 21`.

Aproximaciones: sin mini-retrato en la pestaña y sin experiencia de pesca, combate, forraje ni animales.

## Spec S16: subida de nivel nocturna (`LevelUpMenu`)

**Flujo**:
- Al terminar el día, con la pantalla en negro y antes de guardar, se muestra un `LevelUpMenu` por cada entrada de `newLevels`, en orden.
- OK (clic o X) o elegir profesión saca la entrada y pasa a la siguiente. Al terminar se guarda y empieza el día.

**Contenido**:
- Título `Strings\UI:LevelUp_Title` ("Level {0} {1}"), con el nombre de habilidad de `SkillsPage.cs.11604..9`.
- Ícono de `TileSheets/BuffsIcons` por habilidad: cultivo (0,0), pesca (16,0), recolección (80,0), minería (32,0), combate (128,16) y suerte (64,0). Va ×4 con sombra (−4,+4) a 0,35, en `(x+56, y+112)` y `(x+w−120, y+112)`.
- Info extra (`getExtraInfoForLevel`):
  - Cultivo: Farming1 y Farming2.
  - Minería, pesca, combate y suerte: una línea cada una.
  - Recolección: Foraging1, más Foraging2 en el nivel 1 o Foraging3 en los niveles 4 y 8.
- Recetas nuevas: las de `CraftingRecipes` (campo 4) o `CookingRecipes` (campo 3) con condición `s <Habilidad> <nivel>` (o `<Habilidad> <nivel>`) igual a la habilidad y el nivel.
  - Texto `LevelUp_NewRecipe` ("New {0} recipe: {1}") con `LearnedRecipe_crafting|cooking`, centrado −64, en `y + (grande ? 38 : 12)`.
  - Ícono en `(x + w/2 + ancho/2 − 48, y−16)`.
  - Avance `8 + (grande ? 128 : 64)`.
- Profesiones:
  - Nivel 5: `skill·6` y `skill·6+1`.
  - Nivel 10: `+2/+3` si tiene `skill·6`, o `+4/+5` si no.
- Recetas iniciales: las marcadas `default` en ambos archivos (`Farmer.LearnDefaultRecipes`).

**Layout**:
- Fondo negro a 0,5. Cartel `Cursors (363,87,58,22)` ×4 en `(x + w/2 − 116, y−20)`. Caja `drawDialogueBox`.
- Ancho 768, centrado. Alto `256 + Σ(recetas: 64 o 128) + ⌊líneas·64·3/4⌋`.
- Info desde `y+176`, cada 48. Botón OK `Cursors (128,256,64,64)` en `(x+w+4, y+h−104)`, acotado a la pantalla.
- Elección de profesión (ancho 960, alto 512):
  - Partición horizontal en `y+192` y vertical intersectada (tiles 59, 63 y 62) en `x + w/2 − 32`.
  - "Choose a profession:" centrado en `y+160`.
  - Nombre en dialogueFont en `(x+48 | x+16+w/2, y+256)`, verde si el mouse está encima.
  - Ícono `Cursors ((p mod 6)·16, 624 + ⌊p/6⌋·16)` ×4.
  - Descripción `LevelUp_ProfessionDescription_<Nombre>` partida en `w/2 − 64|48`.

Aproximaciones: sin estrellitas ni animación de entrada y sin perks inmediatos de profesiones (vida de combate).

## Spec S17: resumen de envíos nocturno (`ShippingMenu`)

**Cuándo**: si se envió algo en el día, al dormir y antes de las subidas de nivel. Primero se suma el dinero y después se muestra el resumen. OK (clic o X, solo cuando termina la intro) sigue con el resto de la noche.

**Categorías** (`getCategoryIndexForObject`): 0 cultivo, 1 recolección, 2 pesca, 3 minería, 4 otros, 5 total.
- Los ids `(O)296, 396, 402, 406, 410, 414, 418` van a recolección.
- Las conservas tipo 4, 5 y 10 (pescado ahumado, huevas, etc.) van a pesca.
- Por categoría:

  | Categoría del ítem | Grupo |
  | --- | --- |
  | −81, −27, −23 | Recolección |
  | −80, −79, −75, −26, −14, −6, −5 | Cultivo |
  | −21, −20, −4 | Pesca |
  | −15, −12, −2 | Minería |
  | Resto (incluye semillas −74 y recursos −16) | Otros |

- Las pilas iguales (id y calidad) se consolidan. Valor = `sellToStorePrice · cantidad`.

**Dibujo** (cielo despejado):
- Cielo: `Cursors (639,858,1,184)` estirado a pantalla.
- Estrellas: `(0,1453,639,195)` ×4 en x = 0 y 2556.
- Colinas traseras `(0, 737|1034 invierno, 639, 48)` ×4 espejadas en `H−192`, color (0,20,40) (invierno: blanco·0,25), alfa `0,65 − t`.
- Colinas delanteras `(…, 639, 32)` en `H−128`, color (0,32,20) (invierno: blanco·0,5).
- Ventanita `(653,880,10,10)` en `(160, H−104)`.
- Todo se desvanece con `1 − intro/3500`.
- Filas `i` en `(cx+288, cy−300+108i)`. Cada fila aparece cuando `intro < 2500 − 500i`; el total aparece con la intro ya negativa.
  - Si la categoría tiene ítems: botón `(392,361,10,11)` y marco `(293,360,24,24)` en `p+(−104,−16)`, con el primer ítem en `p+(−88,−4)`.
  - Caja `textureBox (384,373,18,18)` ×4 en `(p.x−620, p.y−20, 512, 104)`, con el nombre de `ShippingMenu.cs.11389..94` en SpriteText en `(p.x−600, p.y+4)`.
  - Seis casillas `(355,476,7,11)` desde `p.x−312`, cada 24.
  - Dial de 7 dígitos `(286, 502−8d, 5, 8)` en marrón desde `p.x−332`.
  - Moneda `(408,476,9,11)` en `p.x−164`.
  - `p = fila + (12, −8)`.
- Cartel de fecha de ayer (`drawStringWithScrollCenteredAt`) en `fila0 − 128`, si es ≥ 0. Rollo `(325,318,12,18)` + `(337,318,1,18)` estirado al ancho del texto + `(338,318,12,18)`, en `y−12`.
- OK `(128,256,64,64)` en `(cx+216, cy+236)`.

Aproximaciones:
- Sin variante de lluvia (nubes) ni luna del día 28.
- Sin la estrella fugaz ni el detalle por categoría (botón +).
- Sin animación de salida.

## Spec S18: artesanía (`CraftingPage`, `CraftingRecipe`)

**Recetas** (`Data/CraftingRecipes`):
- Formato: `ingredientes/área/salida [cantidad]/esGrande/condición/nombre`. En `CookingRecipes` la condición va en el campo 3 y el nombre en el 4.
- Los ingredientes van en pares `id cantidad`. Un id negativo es una categoría:
  - −1..−6: CraftingRecipe.cs.568–573 ("Greens (Any)", etc.).
  - −777: semillas silvestres.
- Una categoría coincide con cualquier `(O)` de esa categoría. Los conteos suman todas las pilas del inventario. Al consumir, se toma en orden de casilla.
- Se muestran las recetas conocidas en el orden del archivo.

**Grilla** (`layoutRecipes`):
- Columnas cada 72 desde `x+40`, filas cada 72 desde `y+120`. Diez columnas y cuatro filas por página.
- Una receta grande ocupa dos filas (64×128). Si no entra en la fila 3, sigue buscando lugar (`spaceOccupied`).
- Ícono de salida a ×4. Sin ingredientes suficientes: DimGray a 0,4.
- Cantidad producida > 1: `NumberSprite` a escala 0,5 en `(x+62, y+62)`.
- Flechas de página: `Cursors` tile 12 (arriba) y 11 (abajo), de 64×64 a ×0,8, en `(x+800, y+120)` y `(x+800, y+344)`.
- Partición en `y+392`. Inventario (no de jugador, con grises) en `(x+56, y+440)`. Tacho en `(x+w+4, y+h−368)`.

**Clic en receta**: si alcanza, crea la salida en la mano (o la suma a la pila de la mano si es igual y entra) y consume los ingredientes. El ítem en la mano se deja en el inventario como en la página de inventario.

**Tooltip de receta** (`drawToolTip` con `craftingIngredients`):
- Título: nombre + ` xN` si produce más de uno. El texto es " " (sin descripción arriba).
- Ancho `max(ancho_título + 12, 384)`. Alto `+= alturaDescripción(ancho−4) − 32`.
- `drawRecipeDescription` en `(x+16, y−8)`:
  - Línea a 0,35 bajo "Ingredients:" (`CraftingRecipe.cs.567`, a 0,75).
  - Por ingrediente i, en `y + 64 + 36i`: ícono a escala `2·16/máx(lado)` centrado en `(+16, +16)`, cantidad con dígitos chicos ×2 AntiqueWhite alineada a `x+32`, y nombre en `x+40` (rojo si falta).
  - Otra línea en `+68 + 36n`.
  - Descripción del ítem partida a `ancho−8` en `+76 + 36n`, a 0,75.
- `alturaDescripción(w) = alto(desc partida) + 36n + alto("Ingredients:") + 21`.

Aproximaciones: sin cocina y sin cofres como fuente de materiales.

## Spec S19: colocar objetos y fertilizantes

**Colocables** (`Object.isPlaceable`):
- Siempre, con la etiqueta `placeable`. Nunca, con `not_placeable` o sin tipo.
- Si no: categoría −8 o −9, tipo `Crafting` o fertilizante (−19), y comestibilidad < 0.
- Los grandes fabricables `(BC)` siempre se pueden colocar. Las semillas siguen el camino de plantar (spec S8).

**Colocar** (clic izquierdo o C con el objeto en la mano, a una casilla del centro del granjero, igual que plantar):
- Fertilizante sobre tierra arada: se aplica si la tierra no tiene fertilizante. Los de calidad 368 y 369 no se aplican si el cultivo ya pasó la fase 0 (`CheckApplyFertilizerRules`).
- Otro objeto: la casilla debe estar libre de entidades, ser transitable, no ser agua y no tocar la caja del granjero.
  - Se crea un objeto colocado o un `bigCraftable` y se consume 1.
  - Gran fabricable: dibujo `TileSheets/Craftables (i mod 8 · 16, ⌊i/8⌋ · 32, 16, 32)` en `(x, y−64)`, profundidad `(y+64−24)/10000`. Es sólido.
- Pico o hacha sobre un objeto colocado: lo quita y lo suelta como ítem.

**Fertilizantes** (`HoeDirt`):
- Calidad: 368 → 1, 369 → 2, 919 → 3, usada en la calidad de cosecha.
- Velocidad: 465 → 0,1, 466 → 0,25, 918 → 0,33.
- Retención de agua: 370 → 0,33, 371 → 0,66, 920 → 1. Al día siguiente la tierra sigue regada si `random < retención`.
- Dibujo `Cursors (173 + ⌊i/3⌋·16, 462 + (i mod 3)·16, 16, 16)`, sobre la tierra y debajo del cultivo. Índice i: 368=0, 369=1, 919=2, 370=3, 371=4, 920=5, 465=6, 466=7, 918=8.

**Pilas** (`Object.maximumStackSize`): `(O)` y `(BC)` hasta 999, salvo 79, 842, 911 y los aparejos (−22), que van de a 1. El resto de los ítems va de a 1.

**Speed-Gro** (`HoeDirt.applySpeedIncreases`, al plantar o al fertilizar):
- Con aumento > 0 o con Agricultor (profesión 5), las fases se reinician desde los datos.
- Se calcula `quitar = ⌈total·(aumento + 0,1 si es Agricultor)⌉`, con total = suma de las fases sin la última.
- Hasta 3 pasadas restan 1 día a cada fase con días > 0 y distinta de 99999, salteando la fase 0 si tiene 1 día. Se corta al llegar a 0.

**Luz de antorcha** (`Object.initializeLightSource`, objetos con etiqueta `torch_item`):
- Textura 4, centro `(x·64+16, y·64+16)` y radio 1,25.
- Color `(1,1,1)·0,9` (amarillo para 94, (70,0,150) para 95).
- Se agrega al colocar y se quita al levantar.

Aproximaciones:
- Sin llama animada en la antorcha.
- Sin cerca conectada, caminos (`Flooring`) ni retoños.
- Interfaz de cofre: ver spec S20.

## Spec S20: cofres (`ItemGrabMenu` de un `Chest`)

**Apertura**:
- La acción sobre un gran fabricable `(BC)130` (cofre) o `(BC)232` (cofre de piedra) abre el menú.
- El cofre guarda 36 casillas, persistidas con la entidad.
- Lo cierran OK, Esc o E. El reloj no avanza con el menú abierto y la barra se oculta.

**Layout** (`MenuWithInventory` con `menuOffsetHack` 64):
- Menú de 880×680 centrado, bajado 64 px (y nunca sobre `y < 136`). Fondo negro a 0,5.
- Inventario del jugador (no de jugador, con grises) en `(x+36, y+312)`, dentro de la caja `drawDialogueBox(x−20, y+200, 880, 680−328)`.
- Cofre (`InventoryMenu` de 36 en 3 filas) en `(x+32, y)`, dentro de la caja `(x−24, y−136, 880, 384)`.
- OK `(128,256,64,64)` en `(x+w+4, y+h−232)` y tacho en `(x+w+4, y+h−368)`.
- Botón de color `(119,469,16,16)` en `(x+w, y + h/3 − 224)` (sin función).
- Pestañas laterales (`Cursors (16,368,12,16)` y `(21,368,11,16)` rotadas 270°, más `(4,372,8,11)`) a la izquierda del inventario, y `(127,412,10,11)` a la izquierda del cofre.

**Interacción** (`grabItemFromInventory` / `grabItemFromChest`):
- Clic izquierdo mueve la pila entera al otro lado. Clic derecho mueve una unidad.
- Se suma primero a pilas iguales y después a casillas libres. Lo que no entra queda en el origen.
- El jugador solo usa sus primeras 12 casillas (mochila inicial).

Aproximaciones: sin selector de color, sin ordenar, sin animación de tapa ni del ítem transferido y sin tacho funcional en este menú.

## Spec S21: máquinas (`Data/Machines`, `MachineDataUtility`)

**Cargar** (acción sobre un gran fabricable con datos de máquina y un objeto `(O)` en la mano; `PlaceInMachine`):
- Solo si la máquina está vacía.
- Regla: la primera de `OutputRules` con un disparador `ItemPlacedInMachine` (bit 1) cuya `Condition` (GSQ) se cumpla.
  - `RequiredItemId` igual al id calificado.
  - `RequiredTags` coinciden todas con las etiquetas de contexto; las que empiezan con `!` deben faltar.
  - `RequiredCount ≤ pila`.
  - Si solo falla la cantidad, se muestra `InvalidCountMessage`.
- `AdditionalConsumedItems` (p. ej. 1 carbón en el horno) debe estar en el inventario; si no, se muestra su mensaje.
- Se consume `RequiredCount` de la entrada y los adicionales.
- Salida: el primer `OutputItem` cuya condición se cumpla.
  - `ItemId` fijo, `DROP_IN` (copia de la entrada) o `FLAVORED_ITEM <Tipo> <DROP_IN_ID|id>`.
  - `RandomItemId` elige uno.
  - Respeta `MinStack/MaxStack`, `Quality`, `CopyQuality` y `CopyPrice`.
- Tiempo: `MinutesUntilReady` si es ≥ 0. Si no, con `DaysUntilReady` es `minutos hasta la mañana`: `(1560 − minutos(hora)) + 400 + (días−1)·1600`.
- `ShowNextIndexWhileWorking` dibuja el sprite +1.

**Productos saborizados** (`ObjectDataDefinition.CreateFlavored*`). Base `p` = precio y `e` = comestibilidad de la entrada:

| Producto | Id | Precio | Comestibilidad |
| --- | --- | --- | --- |
| Vino | 348 | `3p` | `e·1,75f` si e > 0 |
| Jugo | 350 | `trunc(p·2,25f)` | `2e`, o `p·0,4` si e = −300 |
| Jalea | 344 | `2p+50` | `2e`, o `p·0,2` |
| Encurtido | 342 | `2p+50` | `e·1,75f`, o `p·0,25` |
| Miel | 340 | `precio_miel + 2p` | — |

- Color: el de `TailoringMenu.GetDyeColor`. Es blanco para `(O)74`. Si no, sale de la primera etiqueta `color_*` según la tabla de `ItemContextTagManager.GetColorFromTags` (por ejemplo, color_blue (46,85,183) y color_yellow (255,230,0)).
- Nombre: `Strings\Objects:<Tipo>_Flavored_Name` con `{0}` = nombre del ingrediente (Wine, Jelly, Pickles, Juice, etc.).
- Con `ColorOverlayFromNextIndex`, el ícono se dibuja normal y el índice de sprite +1 encima, teñido con el color.
- Apilan solo si coinciden id, calidad, precio y conserva.

**Tiempo**:
- Cada 10 minutos de reloj, todas las máquinas de todas las ubicaciones restan 10 (`minutesElapsed`).
- Al dormir restan los minutos hasta la mañana desde la hora actual.
- Al llegar a 0 quedan listas, y se muestra el sprite +1 solo con `ShowNextIndexWhenReady`.

**Lista**:
- Burbuja `Cursors (141,465,20,24)` ×4 a 0,75 en `(x·64−8, y·64−112+b)`, con `b = 4·round(sin(ms/250), 2)`.
- El producto va ×4 a 0,75 centrado en `(x·64+32, y·64−72+b)`.
- La acción sobre la máquina lista pasa el producto al inventario (si entra) y vacía la máquina.

Aproximaciones:
- Sin efectos de carga ni de trabajo (humo, sonido, temblor), sin luz de trabajo y sin experiencia al recoger.
- Sin máquinas que no usan `ItemPlacedInMachine` (colmenas, paneles, etc.) ni `OutputMethod`.
- Sin `ReadyTimeModifiers`.

## Spec S22: otras tiendas (`TryOpenShopMenu` y acciones de mapa)

**Dueño**: `TryOpenShopMenu(id, ubicación, área?, yMáx?)` abre la tienda si alguno de los `Owners` vigentes (con `Condition` GSQ) es un NPC de la ubicación dentro del área y con `y ≤ yMáx`. `AnyOrNone` y `None` abren siempre; `Any` acepta a cualquier NPC.

**Acciones** (propiedad `Action` en la capa Buildings):

| Acción | Comportamiento |
| --- | --- |
| `Buy General` | SeedShop, área (4,17,1,1), `yMáx = y_jugador − 1`. Si no hay dueño, mensaje `GameLocation.cs.8525`. |
| `Buy Fish` | FishShop, `yMáx = y_jugador − 1`. |
| `Saloon` | Saloon, área (9,17,10,2). |
| `HospitalShop` | Hospital, área `(x−1, y−2, 2, 1)` del jugador. |
| `Blacksmith` | Clint en `(x, y−1)` o `(x−1, y−1)` de la casilla de acción. Pregunta Shop / Upgrade Tools / Leave (`Strings\Locations:Blacksmith_Clint_*`); Shop abre `Blacksmith`. |
| `AnimalShop` | Marnie en las mismas casillas. Pregunta Supplies / Purchase Animals / Leave; Supplies abre `AnimalShop`. |
| `Carpenter` | Robin a ≤ 3 casillas. Pregunta `ScienceHouse_CarpenterMenu` con Shop / Upgrade House / Construct / Leave; Shop abre `Carpenter`. |

**Ítems**:
- Los grandes fabricables se dibujan en menús a la mitad de escala si `scaleSize > 0,2`, sin sombra (`Object.drawInMenu`).
- No llevan sombra `(O)590` ni `(O)SeedSpot`.
- El stock omite ítems que todavía no se pueden dibujar: muebles `(F)` y consultas como `RANDOM_ITEMS` o `DISH_OF_THE_DAY`.

**Mejora de herramientas** (`ClintUpgrade`, consulta `TOOL_UPGRADES`):
- Por cada herramienta de `Data/Tools` con `ConventionalUpgradeFrom` presente en el inventario, se ofrece la mejora.
  - Precio por nivel: 1 → 2000, 2 → 5000, 3 → 10000, 4 → 25000.
  - Barras por nivel: 334, 335, 336, 337, siempre ×5.
- También se aceptan las entradas de `UpgradeFrom` (con condición GSQ).
- En la fila, el ítem de canje va ×4 a la izquierda del precio, en `derecha − (ancho_precio + 96) − 88 − ancho("x5")`, seguido de "xN" (a 0,25/0,5 si falta).
- Comprar (`Tool.actionWhenPurchased`), si no hay otra mejora en curso:
  - Se quita la herramienta anterior y se cobran oro y barras.
  - Queda en `toolBeingUpgraded` por 2 días, se cierra la tienda y Clint dice `Tool.cs.14317`.
- Cada noche resta 1 día. Con 0 días, la acción en el mostrador entrega la herramienta antes del menú, o muestra `Clint_NoInventorySpace` si no hay lugar.

Aproximaciones: sin efecto del nivel de la herramienta (carga y área), compra de animales, construcción, mejora de casa, geodas ni diálogo del dueño en la tienda.

## Spec S23: pesca (`FishingRod`, `BobberBar`, `GameLocation.GetFishFromLocationData`)

**Lance**:
- Con una caña (`ClassName` FishingRod) en la mano, mantener C o clic carga el poder.
  - El poder va de 0 a 1 a `0,001·ms` y rebota en los extremos.
  - Medidor: `Cursors (193,1868,47,12)` ×4 en `(pos.x−48, pos.y−160)`. El relleno mide `164·poder × 25` en `(pos.x−36, pos.y−148)`, con color rojo→verde.
- Al soltar se gasta energía `8 − nivel·0,1` y la boya cae desde el centro del granjero:
  - Horizontal: a `máx(128, poder·(extra+4)·64) − 8`.
  - Vertical: a `máx(128, poder·(extra+3)·64)`.
  - `extra` según nivel de pesca: ≥15 → 4, ≥8 → 3, ≥4 → 2, ≥1 → 1.
  - Si la casilla no es agua, se cancela.
- La boya es `TileSheets/bobbers (0,16,16,16)` ×4.
- `clearWaterDistance` = radio del primer anillo de casillas que contiene tierra (`distanceToLand`).

**Picada**:
- Tiempo `Random(600, máx(600, 30000 − 250·nivel))`, ×0,75 en el primer lance, mínimo 500.
- Al picar hay 800 ms para tocar: se muestra "!" (`Cursors (395,497,3,8)`, escala 5 que decrece) sobre la cabeza.
- Si no se toca a tiempo, se recalcula la espera. Tocar sin picada recoge la línea.

**Pez** (`GetFishFromLocationData`, dos pasadas):
- Entradas `Default.Fish` + `Fish` de la ubicación, ordenadas por `Precedence` y al azar.
- Se filtra por:
  - Estación, `PlayerPosition` y `BobberPosition`.
  - `MinFishingLevel` y distancia a la orilla mínima y máxima.
  - Cebo mágico.
- Probabilidad `GetChance`: `Chance + suerte diaria (si aplica) + ChanceBoostPerLuckLevel·nivelSuerte`. Después, `Condition` GSQ y `CatchLimit`.
- `CheckGenericFishRequirements` con `Data/Fish`:
  - Hora dentro de algún rango del campo 5 y clima del campo 7 (sunny/rainy).
  - Nivel ≥ campo 12.
  - `prob = campo10 − máx(0, campo9 − profundidad)·campo11·campo10 + nivel/50` (×1,1 con caña de entrenamiento), tope 0,9.
  - La caña de entrenamiento no pesca dificultad ≥ 50 salvo `CanUseTrainingRod`.
- Con 0 peces atrapados (tutorial) solo vale un pez con el campo 13 en true. Si no sale nada: Sunfish `(O)145` en el tutorial, o basura `(O)168`.
- Si el resultado no es un pez (categoría −4), se entrega directo.

**Minijuego** (`BobberBar`, 60 Hz; ver código para cada constante):
- Campos de `Data/Fish`: dificultad (1), movimiento (2: mixed/dart/smooth/sinker/floater) y tamaño mínimo/máximo (3, 4).
- Tamaño = `min + (max−min)·f` + 1, con `f = clearWater/5 · Random(1+nivel/2, máx(6, ·))/5 · (1 ± 10%)`. Calidad 0, 1 o 2 según f < 0,33 / < 0,66.
- Barra: alto `96 + 8·nivel`, más `40 − 8·nivel` con caña de principiante y nivel < 5 (que además fuerza calidad 0). Posición inicial `568 − alto`.
- Primer pez: progreso inicial 0,1, dificultad mínima 50 y sin penalización al salir de la barra.
- Pez:
  - Objetivo aleatorio con probabilidad `dif·(smooth ? 20 : 1)/4000`.
  - Aceleración `(objetivo − pos)/(Random(10,30) + 100 − dif)` con suavizado /5.
  - Saltos de ±(50..100) con probabilidad `dif/2000`; los dart, de ±(50..100+2·dif) con probabilidad `dif/1000`.
  - sinker/floater suman ±0,01 por tick (tope 1,5).
- Barra: gravedad +0,25, o −0,25 con el botón apretado; ×0,6 si el pez está dentro. Rebota en los bordes con `−v·2/3`.
- Dentro: `pos+12 ≤ barra−32+alto` y `pos−16 ≥ barra−32`.
- Progreso: +0,002 dentro y −0,003 fuera (−0,002 con caña de principiante). Salir de la barra después de haber entrado quita el "perfecto".
- Fuera de la barra, el tamaño baja 1 cada 800 ms.
- Con perfecto, la calidad sube (≥2 → iridio, ≥1 → oro).
- Experiencia: `máx(1, (q+1)·3 + dif/3)`, más 140% si es perfecto y ×5 si es jefe.
- Dibujo:
  - Burbuja `(652,1685,52,157)` a 0,6.
  - Marco `(644,1999,38,150)`.
  - Barra verde `(682,2078|2081|2085,9,…)`, a `0,25·(sin(ms/100)+2)` fuera.
  - Progreso de 16 px de ancho, rojo→verde, en `x+124`.
  - Carrete `(257,1990,5,10)` rotando.
  - Pez `(614|634 jefe,1840,20,20)` ×2 en `(x+82, y+36+pos)`.
  - Posición de la barra: `(pos.x−196 | pos.x+128 mirando a la derecha, pos.y−338)`, acotada a la pantalla.
- Durante el minijuego el tiempo no avanza y la barra de herramientas se oculta.

Aproximaciones:
- Sin animación de caña ni línea, y sin el vuelo de la boya.
- Sin tesoros, carnada ni aparejos.
- Sin estaciones de `FishAreaId` ni suerte diaria.
- Willy no regala la caña (la de entrenamiento se compra a 25g).

## Spec S24: minas (`MineShaft`)

**Entrada y salida**:
- La acción `Mine` del mapa `Mine` (tile 23,9) lleva al nivel 1. Cada nivel es la ubicación `UndergroundMine<N>`.
- El granjero aparece bajo la escalera de subida: el primer tile 115 de `Buildings` (hoja `mine`), una fila más abajo.
- Tile 173 en `Buildings` baja al nivel N+1.
- Tile 115 pregunta `" "` con `Mines_LeaveMine` / `Mines_DoNothing`. Salir lleva a `Mine` (23,8) mirando arriba.
- Los niveles no se guardan. El generador usa `new Random()` sin semilla, así que cada visita es distinta.
- Se guarda `deepestMineLevel` y, al llegar al 120, `timesReachedMineBottom`.

**Área** `getMineArea`:
- 0 para niveles 1–10 y 30–39.
- 10 para 11–29.
- 40 para 40–79.
- 80 para 80–120.
- 121 a partir de ahí (Skull Cavern, sin implementar).

**Mapa** `Maps/Mines/<n>`:
- Si `N%40%20 == 0` y `N%40 != 0`, n = 20. Si no, n = N cuando `N%10 != 0`, o 10 en caso contrario.
- Después n %= 40. El nivel 120 usa el mapa 120.
- La textura `mine` se reemplaza según el área:
  - Área 40: `mine_frost`, con `_dark` desde el 70.
  - Área 80: `mine_lava`, con `_dark` desde el 110 salvo el 120.
  - Mapa 45: siempre oscuro (`mine_dark` o sufijo `_dark`).
- `isDarkArea` = (textura oscura o `N%40 > 30`) y área ≠ 40.

**Iluminación** (`chooseLevelType`, con `CreateDaySaveRandom(díasJugados, N, 4N)`):
- Base (80,80,40), o (100,100,50) en el área 80.
- 30% si N>2: (120,120,40), y con otro 30%, (150,150,60).
- 15% si N>5 y N≠120, según el área:
  - Áreas 0 y 10: (110,110,70).
  - Área 40: negro.
  - Área 80: (90,130,70).
- Se consume una tirada más (luces arcoíris, sin implementar).
- En área oscura con N<120: (70,100,100) en el área 80, o (150,150,120) en las demás.
- El nivel 100 usa (140,140,80).
- Ese color es el ambiente fijo del lightmap.
- La escalera de subida suma 4 luces de textura 4 en (x·64+32, (y−2+i)·64), con radios 0,25/0,5/0,75/1.

**Probabilidades** (`populateLevel` + `adjustLevelChances`):
- Valores iniciales:
  - piedra `Next(10,30)/100`;
  - monstruo `0,002 + Next(200)/10000`;
  - ítem 0,0025;
  - gema 0,003.
- Nivel 1: monstruo, ítem y gema en 0.
- `N%5 == 0`: ítem y gema en 0. Si además `N%10 == 0`, monstruo en 0.
- La probabilidad de gema se divide por 2.
- Los niveles `N%10 == 0` no se pueblan.

**Recorrido**: por columnas x y, dentro, filas y.
- Solo se usan tiles libres:
  - fuera del tile de llegada;
  - `Back.Type == "Stone"`;
  - con `Back`, sin `Front` ni `Buildings`;
  - índice `Back` distinto de 77;
  - sin objetos ni rocas grandes.
- En cada tile:
  1. Si `r ≤ piedra`:
     - En el área 40, un 15% de las veces son malezas 319–321.
     - Si no, `createLitterObject`. Las piedras cuentan para `stonesLeft`.
  2. Si no, si `r ≤ monstruo` y la distancia a la llegada es > 5: monstruo (sin implementar; el tile queda vacío).
  3. Si no, si `r ≤ ítem`: objeto recogible de `getRandomItemForThisLevel`.
     - 5% (N>80): 422.
     - 10% (N>20, área ≠ 40): 420.
     - 25%: 86, 84 u 82 según el área.
     - En otro caso: 80.
  4. Si no, si `r ≤ 0,005`, el área no es oscura y los 3 vecinos (x+1,y), (x,y+1), (x+1,y+1) están libres: roca 2×2 `Choose(752,754)`, o `Choose(756,758)` en el área 40.
- Si `stonesLeft > 35`, se abren `stonesLeft/35` claros:
  - Se elige un objeto al azar. Si es piedra, se toma un radio `Next(3,8)` y se consume una tirada.
  - Se borran las piedras del cuadrado `[x−r/2, x+r/2)`, con división entera.
- Extras por área (`tryToAddAreaUniques`):
  - Ocurren en las áreas 10 y 80, o en la 40 con un 10%, si el área no es oscura.
  - Se colocan `Next(7,24)` grupos de malezas: 313, 319 en el área 40 o 316 en la 80.
  - Cada grupo usa `recursiveObjectPlacement` con decaimiento `Next(10,40)/100`, 3 variantes y 58% de saltos.
- Escalera inicial: con 95%, si N>1, `N%5 != 0` y N≠120, en un tile aleatorio libre.
- Vetas (`tryToAddOreClumps`, si `N%5 != 0` y N>2):
  - Con 55%, una o más vetas (cada una adicional con 25%) en tiles aleatorios de suelo sólido no excavable.
  - La veta sale de `getAppropriateOre`: cobre 751(3); en el área 40, hierro 290(4) con 80%; en la 80, oro 764(8) con 80%; 25% de piedra 668 (fuera del área 40).
  - Se expande con `recursiveObjectPlacement(0,95, 0,3, 5% saltos)`. Las piedras alternan 668/670.
- `recursiveObjectPlacement` coloca solo en tiles con `Back`, sin `Buildings`, desocupados y con `Type` distinto de `Dirt`.

**`createLitterObject`** (sin dificultad extra). Salida: id(vida).
- Áreas 0 y 10:
  - `Next(31,42)`. Si `N%40 < 30` y está en [33,38): `Choose(32,38)`. Si `N%40 ≥ 30`: `Choose(34,36)`. Vida 1.
  - Cobre 751(3) con 2,9% si N≠1 y `N%5 != 0`.
- Área 40: `Next(47,54)` con vida 3, e hierro 290(4) con 2,9% si `N%5 != 0`.
- Área 80, vida 4:
  - 30% y no oscura: 38 o 32.
  - Si no, 30%: `Next(55,58)`.
  - Si no: 760 o 762.
  - Oro 764(8) con 2,9% si `N%5 != 0`.
- Común (suerte = suerte diaria + minería·0,005):
  - N>50: diamante 2(10) con `0,00025 + N/120000 + 0,0005·suerte/2`.
  - Si no, gema `getRandomGemRichStoneForThisLevel`(5) con `pG + pG·suerte + N/24000`.
  - Piedra 44 con `0,0005 + 0,001·minería·0,008 + 0,001·diaria/2`.
  - N>100: 46 con la fórmula análoga sobre 0,00005.
  - Se redondea a par.
  - 10% (área ≠ 40): `Choose("668","670")` con vida 2 y volteo al azar.
- Gema por nivel: `Next(59,70)` redondeado a par. Sin haber llegado al fondo:
  - N<40 fuerza 66 o 68.
  - N<80 cambia 64 y 60 por `Choose(66,70,68,62)`.
  - Nodos: 60→"12", 62→"14", 64→"4", 66→"8", 68→"10", 70→"6".
- `RandomExtensions.Choose` de 2 opciones usa `NextDouble() < 0,5`. Con 3 o más usa `Next(n)`.

**Pico** (`Pickaxe.DoFunction`):
- Cada golpe resta `máx(1, mejora+1)` a la vida (`MinutesUntilReady`) y sacude el objeto 200 ms (±1 px).
- Se rompe al llegar a ≤ 0. Las piedras con vida 0 (granja) caen al primer golpe.
- Al romper: polvo de `animations` fila 46, 10 cuadros de 80 ms, con velocidad −0,6, aceleración 0,002 y desvanecimiento 0,015 por tick.

**`checkStoneForItems`** (niveles generados; r = `CreateDaySaveRandom(x·1000, y, N)`, con una tirada descartada):
- Se resta 1 a `stonesLeft`.
- Probabilidad de escalera: `0,02 + 1/máx(1, restantes) + suerte/100 + diaria/5`, más 0,04 sin enemigos.
  - Aparece si no hay otra y (quedan 0 piedras o la tirada pasa), salvo en el nivel 120.
  - Pone el tile 173 y 5 polvos (fila 5, alfa 0,5, retrasos 0–600 ms).
- Luego `breakStone`. Si da experiencia, termina ahí:
  - 751 y 849: cobre ×(`Next(1,4)` + suerte/100 + minería/100), 5 XP.
  - 290: hierro, 12 XP.
  - 764: oro, 18 XP.
  - 765: iridio y prismático con 3,5%, 50 XP.
  - 668 y 670: piedra ×(`Next(1,3)`…), 3 XP; con 8%, carbón, 4 XP.
  - Nodos de gema: 2→72 (150), 4→64 (80), 6→70 (40), 8→66 (16), 10→68 (16), 12→60 (80), 14→62 (40). La 44 se convierte antes en `Next(1,8)·2`.
  - 46: iridio `Next(1,4)` y oro `Next(1,5)`, prismático con 25%, 150 XP.
  - Profesiones: Minero (18) suma 1 a cada cantidad. Geólogo (19) duplica gemas con 50%.
- Si no dio experiencia:
  - Geoda 535/536/537 según el área, con `0,022·(1+mod)`.
  - Omni-geoda 749 si N>20, con `0,005·(1+mod)`.
  - Con `0,05·(1+mod)·(1,2 si es la piedra 40/42, si no 0,8)`: carbón con 25% y mineral del nivel, 5 XP.
  - Si no, 50%: una piedra.
  - mod = diaria/2 + minería·0,005 + suerte·0,001.
- Mineral del nivel:
  - N<40: hierro con 10% desde el 20; si no, cobre.
  - N<80: oro con 10% desde el 60; si no, hierro con 75% o cobre.
  - N≥80: oro con 75%; si no, hierro con 75% o cobre.
- Las minas no son exteriores: las piedras comunes no dan experiencia propia.

**Piedras de la granja** (`GameLocation.OnStoneDestroyed` + `breakStone` exterior):
- Para 343/450, con `CreateDaySaveRandom(x·2000, y, 0)` y solo si `díasJugados > 1`:
  - Geoda con 3,5% (535; con más de 60 días, 20% de 536; con más de 120, 20% de 537).
  - Carbón con 3,5% (×2 con Prospector).
  - Piedra con 1%.
- `breakStone` exterior (r = `(x·1000, y, 0)`): una piedra y 1 XP. Con `0,05·(1+mod)`, carbón y 5 XP más.

**Recolección**: los objetos `IsSpawnedObject` se toman con la acción.
- Si son forrajeables (categorías −79, −81, −80, −75, −23, el tag `forage_item` o el 430):
  - Calidad con `CreateDaySaveRandom(x, y·777, 0)`: iridio con Botánico; si no, oro con forrajeo/30 y plata con forrajeo/15.
  - Dan 7 XP de forrajeo.

**Ascensor** (`MineElevatorMenu`):
- Se abre con la acción `MineElevator` (en `Mine`, tile 17,3) o con el tile 112 de `Buildings` en los niveles.
- Botones: uno cada 5 niveles hasta `mín(nivel más profundo, 120)`.
  - El ancho es `n > 50 ? 548 : mín(284, n·44+64)`, con n = nivel/5.
  - Los botones miden 44 px. Empiezan en `(x+44, y+42)`, avanzan 44 px y saltan de fila al pasar `x+ancho−32`.
- Dibujo:
  - Fondo negro al 40% y caja `drawDialogueBox(x, y−56, ancho+21, alto+64)`.
  - Cada botón es `Cursors (256 o 267 con el mouse encima, 256, 10, 10)` ×4 con sombra negra al 50% desplazada (−4, +4).
  - El número va en `NumberSprite` a escala 0,5: dorado, o gris·0,75 si es el nivel actual.
  - Botón de cierre arriba a la derecha.
- Elegir 0 desde un nivel lleva a `Mine` (17,4) mirando a la derecha. Otro nivel entra a la mina y ubica al granjero bajo el ascensor.

**Aproximaciones**:
- Sin barriles, pozos, niveles infestados ni cantera.
- Sin mapas alternativos tras llegar al fondo, luces arcoíris, niebla, caminos del minero, Skull Cavern ni suerte diaria (vale 0).
- Las rocas 2×2 no se pueden romper todavía.
- Las luces se dibujan sin tinte.
- Falta el sprite de piedra agrietada al romper.

## Spec S25: combate (`Monster`, `GreenSlime`, `Bug`, `MeleeWeapon`, `Farmer.takeDamage`)

**Monstruos en las minas** (`getMonsterForThisLevel`, sin dificultad extra):
- Áreas 0 y 10:
  - 25%: `Bug` con dirección `Next(4)`.
  - Nivel < 15: `Duggy` en tierra excavable; si no, 15% `Rock Crab`; si no, `Green Slime`.
  - Niveles 15–30: `Duggy` en tierra excavable. Si no, en orden:
    - 15% `Rock Crab`;
    - 5% `Fly` (a más de 10 tiles);
    - 45% `Green Slime`;
    - si no, `Grub`.
  - Niveles 31–40: 10% `Bat` (a más de 10 tiles); si no, `Stone Golem`.
- Área 40:
  - Desde el nivel 70, 75%: `Skeleton`.
  - Si no, 30%: `Dust Spirit`.
  - Si no, 30% (a más de 10 tiles): murciélago helado.
  - Desde el 51: un `Ghost` por nivel, con 30%, a más de 10 tiles.
  - Si no, `Green Slime`.
- Área 80, en orden:
  - 25% murciélago si es oscura;
  - 15% `Green Slime`;
  - 15% `Metal Head`;
  - 25% `Shadow Brute`;
  - 25% `Shadow Shaman`;
  - 25% `Lava Crab`;
  - 20% `Squid Kid` (a más de 8 tiles, desde el nivel 90);
  - si no, `Green Slime`.
- Puntos de aparición en `populateLevel`:
  - Tiles libres con `r ≤ monstruo` y distancia > 5. 0,175% de ítem especial. Grub y Dust Spirit suman vecinos con 40% y 60%.
  - Tiles no libres con suelo sólido: misma probabilidad y distancia; 1% de ítem especial.
  - Claros de piedras: 10% del claro y 12% por piedra.
- Implementados: `Green Slime`, `Bug`, `Rock Crab`, `Duggy`, `Grub`, `Fly`, `Bat` y `Stone Golem`, que cubren los niveles 1–40.
- Todavía no aparecen los demás, de los niveles 41–120 y de las áreas infestadas.

**`Data/Monsters`**: los campos son vida / daño / monedas mín / monedas máx / planeador / duración de movimiento al azar / botín / resiliencia / nerviosismo / umbral de persecución / velocidad / fallo / de mina / experiencia / nombre.
- El botín se tira al crear el monstruo: cada par `id prob` entra si `NextDouble() < prob`.

**Base `Monster`**:
- Caja `(X+8, Y+16, 48, 32)`.
- `withinPlayerThreshold(n)`: el tile del centro está a ≤ n del tile del granjero en ambos ejes.
- Movimiento por tick:
  - Si persigue y el granjero está dentro del umbral: elige eje hacia la posición del granjero con margen 16 px. Primero el horizontal si no se movió en X; si ningún eje está libre, se detiene. Con 0,1% de probabilidad, si quedó quieto, toma una dirección perpendicular por 700 ms.
  - Si no persigue: con `nerviosismo·1,8` elige `Next(6)` (4 direcciones o detenerse).
- `MovePosition`, con la velocidad de empuje:
  - Se subdivide si supera el tamaño de la caja.
  - Si no choca: `X += vx; Y −= vy` y luego `v −= v/resbaladizo`.
  - Si choca: `v −= v/resbaladizo/4` cuando resbaladizo ≥ 8.
  - Valores menores a 0,05 pasan a 0.
- Después se mueve `speed` px en cada dirección activa.
- Moverse hacia la caja del granjero cuenta como choque y llama a `takeDamage(daño)`.

**`GreenSlime`**:
- Por nivel < 40:
  - Color `(g/Next(2,10), g = Next(200,256), 1% ? 255 : 255−g)`.
  - 1% especial si `N%5 ∉ {0,1}`: color (205,255,0)·0,7, vida ×3, daño ×2, ítem especial.
  - 49% "tierno": vida +1/4, daño +1.
  - Resbaladizo 3. Deriva izquierda al 50%.
- Comportamiento:
  - Si está dentro del umbral y pasaron 4000 ms (1000 si está enfocado) desde el último salto: 1% por tick de preparar un salto de 800 ms (cuadros 16 + (800−t)/200).
  - El salto pone resbaladizo 10, sigue persiguiendo y aplica `−(empuje lejos del granjero)/2`.
  - Con 10% por tick deriva `speed` px de lado y cambia de deriva con 8%.
- Dibujo:
  - Sombra en `(X+32, Y+36+yOffset)`, escala `4 − (cuadro%4%3 ≠ 0) + yOffset/30`.
  - Cuerpo gris teñido con el color, origen (8,16), en `(X+32, Y+16+yOffset)`.
  - Cara `(32 + (preparando o enfocado ? 16 : 0), 120 + (sin preparar y (enfocado o invencible) ? 24 : 0), 16, 24)`, desplazada `cara·4` (se mueve ±8 según la dirección) más el rebote del cuadro. Alfa 0,5 mirando arriba.
  - `yOffset` baja con la velocidad y vuelve a 0.

**`Bug`**:
- Cuadros de 16×16 a 40 ms. No persigue: avanza en su dirección y la invierte al chocar, salvo contra el granjero.
- Sombra en `(X+32, Y+32)`. Cuerpo con origen (8,16) en `(X+32, Y)`, oscilando ±10 px (`sin(ms/1000·2π)`) en el eje perpendicular.

**Espada** (`MeleeWeapon` tipos 0 y 3, y la guadaña):
- Animación por dirección:
  - Abajo: cuadros 24–29 con brazo secundario.
  - Derecha: 30–35 con brazo secundario.
  - Arriba: 36–41.
  - Izquierda: 30–35 volteados.
  - Tiempos 55/45/25/25/25 ms y `2·(400−vel·40)/8·1,3` (130 ms con velocidad 0).
- Cada cuadro llama a `showSwordSwipe` → `DoDamage`:
  - Área `getAreaOfEffect` según dirección y cuadro (base 64×64, o 64×96 hacia abajo, con desplazamientos por cuadro).
  - Corta pasto y malezas en los tiles del borde del área, y golpea monstruos.
- El sprite (16×16 de `TileSheets/weapons`) se dibuja con origen (1,15) y escala 4, en `Position +` una tabla de 8 poses por dirección (x, y, rotación, volteo).
  - Profundidad: +1 para las poses tempranas a la derecha e izquierda. Si no, +1 arriba, +15 abajo y +20 a los lados.

**`damageMonster`**:
- Daño `Next(mín, máx+1)`.
- Crítico si `r < crit + suerte·crit/40`: ×multiplicador (+50% con profesión 25).
- `máx(1, daño + ataque·3)`, luego ×1,1 (24), ×1,15 (26) y ×2 si es crítico (29).
- `takeDamage`:
  - `máx(1, daño − resiliencia)`.
  - Falla si `r < fallo − fallo·precisión/10`.
  - Empuje `(lejos del granjero)·knockback/3`. La dirección lejos del granjero se normaliza y se multiplica por `50 + Next(−20,20)` en cada eje.
- Invencibilidad de 225 ms (150 con dagas).
- Números de daño: naranja (255,130,0); amarillo con escala `1+daño/300` en críticos.
- Al morir:
  - Suelta el botín y da la experiencia de combate (1/3 en la granja).
  - Polvo de `animations` fila 44.

**`RockCrab`**:
- 40% "espera": mientras conserve el caparazón entero no se mueve. Umbral 3.
- Si el granjero sale del umbral, se detiene. Al moverse, salta el cuadro cerrado (`cuadro%4 == 0`).
- Los golpes con el caparazón cerrado (`cuadro%4 == 0`) hacen 0. Los demás golpes ponen resbaladizo 3 y aplican el empuje completo.
- Cada golpe de pico (`hitWithTool`) resta 1 al caparazón (5), sacude 500 ms y lo empuja.
- Sin caparazón persigue siempre en la dirección general del granjero, con los cuadros 16–19.

**`Duggy`**:
- Invisible y sin daño.
- Si el granjero entra en su caja inflada 128 px y está sobre tierra excavable (o el índice 0), aparece en el tile del granjero.
- Animación:
  - Cuadros 0–3 a 100 ms.
  - Cuadros 4–7 a 220 ms, con daño 8 por contacto.
  - Cuadros 8–9, y vuelve a esconderse.
- Al esconderse deja un hoyo: el índice 0 de `Back`.

**`Grub`**:
- Persigue dentro del umbral. Fuera de él se detiene con giro aleatorio.
- Con vida ≤ máx/2 − 2: huye en el eje lejano.
- Tras 2000 ms anima los cuadros 16–19 a 125 ms y pasa a pupa por 4500 ms. La escala late con `1 + sin(ms·0,39)/12` y los golpes no la dañan.
- Al terminar se convierte en `Fly`.

**`Fly`** y **`Bat`** (planeadores):
- Mosca: resbaladizo `24 ± 10`. Aparece con escala de 0 a 1 en 1000 ms.
- Murciélago: resbaladizo `20 + Next(−5,6)`. Cuelga en el cuadro 4 hasta ver al granjero a 6 tiles; después aletea en los cuadros 0–3 a 80 ms.
- Ambos se dirigen girando 0,049 rad por paso hacia el granjero.
  - Velocidad `+= −dir·v/6 ± 0,1`, con `v = clamp(máx − dist/128, 1 o 2, máx)`.
  - Máximo 5 para el murciélago y 7 para la mosca.
  - Cerca se acelera ×1,05 o ×1,1.
- Un golpe suspende el giro 500 ms.
- Dibujo:
  - Murciélago en `(X+32, Y+32)` sobre todas las capas, con sombra en `(X+32, Y+64)`.
  - Mosca rotada en `(X+32, Y−16)` con sombra en `(X+32, Y+16)`.

**`RockGolem`**:
- Quieto en el cuadro 16 (parece una roca) hasta que el granjero entra en el umbral.
- Entonces anima los cuadros 16–23 a 75 ms y pasa a perseguir con umbral 16, nerviosismo 0,01 y sombra.
- En los niveles 41–80: vida ×1,75 y daño ×1,5. Por encima de 80: vida ×2,5 y daño ×2.

**Herramientas pesadas** (hacha, pico, azada):
- Al usarse dañan a los monstruos en un cuadrado de 64 px centrado en el punto de la herramienta. Daño `mejora+1` a `3·(mejora+1)`, sin crítico ni invencibilidad.
- El pico golpea primero el caparazón del cangrejo.

**Daño al granjero** (`Farmer.takeDamage`):
- `daño + Next(mín(−1, −d/8), máx(1, d/8))`, menos defensa (con alivio aleatorio si defensa ≥ d/2). Mínimo 1.
- 1200 ms de invencibilidad con parpadeo. Número rojo.
- Con vida 0, desmayo:
  - En las minas se revive en `Mine` (22,9). Si no, en `Hospital` (20,12).
  - Vuelve con vida 10.
- La vida se repone al dormir.

**Barra de vida**:
- Visible en las minas o con vida < máxima.
- 56 px a la izquierda de la de energía, en `y = alto − 240 − (máx−100)`.
- Piezas `Cursors (268,408/424/448,12,16)`. Relleno `168+(máx−100)` con color rojo→verde y los 4 px superiores más oscuros.
- Con vida < 20 pulsa en rosa.

**Espada inicial**: la primera vez que se entra a `Mine` se recibe la Espada oxidada `(W)0` y se marca el evento 100162. El evento de Marlon todavía no se reproduce.

**Aproximaciones**:
- Faltan dagas, mazos, especiales, anillos, defensa, buffs, botín extra (`getExtraDropItems`) y apareamiento de slimes.
- Sin deslizamiento en esquinas para monstruos, brillo exacto (se usa un pulso rojo), sacudida de pantalla, sonidos, ni pérdida de ítems al desmayarse.
- No hay mensaje al desmayarse.

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
