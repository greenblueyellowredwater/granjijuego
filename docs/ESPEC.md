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

## Spec S2: movimiento, colisión y warps

Fuente: literales, llamadas y constantes de `GameLocation.isCollidingPosition` (y sus lambdas), `isTilePassable`, `isTileLocationOpen`, `isWaterTile`, `updateWarps`, `performTouchAction`, `performAction`, `Farmer.GetBoundingBox`, `Farmer.getMovementSpeed` y `Farmer.setRunning`. Los marcados (?) son inferencias a validar contra el juego real.

**Unidades.** El mundo se mide en píxeles de juego: 64 por tile, que es el tile de 16 px del asset dibujado ×4. La posición de un personaje es la esquina superior izquierda de su tile de pies.

**Caja de colisión del granjero.** 48 × 32 px, desplazada 8 px a la derecha de la posición y 16 px hacia abajo (?). Es decir, ocupa la mitad inferior del tile y deja 8 px de margen a cada lado.

**Velocidad.** Corriendo, 5 px de mundo por tick de 1/60 s; caminando, 2. En diagonal cada eje se multiplica por ≈0,707. El desplazamiento se escala por el tiempo real transcurrido.

**Prueba de colisión.** Se testean las esquinas de la caja contra la grilla de tiles. Un tile **bloquea al granjero** si se cumple alguna de estas condiciones:
1. Está fuera del mapa, salvo que haya un warp en ese tile (los warps de borde usan coordenadas −1 o ancho/alto).
2. No hay tile en `Back` (vacío de interiores) (?).
3. El tile de `Back` tiene la propiedad `Passable`, del tile o de su índice en el tilesheet. Lo que importa es que exista, no su valor; en los datos es casi siempre `F`.
4. El tile de `Back` tiene `Water` (salvo nadando).
5. Hay un tile en `Buildings` que no tiene `Passable` ni `Shadow`. Un tile de `Buildings` con `Action` no es atravesable para el granjero.

`NPCBarrier`, `TemporaryBarrier`, `NPCPassable` y `ProjectilePassable` solo afectan a NPCs y proyectiles. Los objetos, terrain features, muebles, edificios y otros personajes colisionan con sus propias cajas, lo que queda para hitos posteriores.

Movimiento: cada eje se resuelve por separado. Si el paso en X choca se cancela X y se intenta Y, y viceversa, así el granjero se desliza por las paredes.

**Warps.** La propiedad de mapa `Warp` es una lista de grupos de 5 campos `desdeX desdeY destino haciaX haciaY`. Los grupos inválidos se ignoran con una advertencia. `NPCWarp` usa el mismo formato y solo aplica a NPCs. El granjero se transporta cuando el tile que contiene el centro de su caja coincide con el origen de un warp (incluidos los de fuera del mapa).

**Acciones al interactuar** (tecla de acción sobre el tile enfrente, propiedad `Action` en `Buildings`):
- `Warp x y Destino`: transporta.
- `LockedDoorWarp x y Destino apertura cierre`: igual que `Warp`, pero solo entre las horas indicadas (formato 900/2100). Sin reloj se considera abierta.
- `Door Npc…`: puerta de cuarto de NPC (requiere amistad; pendiente).
- Hay más de 100 acciones más (`Mailbox`, `Message`, `Garbage`, tiendas…) que se especifican por hito.

**Acciones al pisar** (`TouchAction` en `Back`): `Warp`, `MagicWarp`, `Door`, `Sleep`, `Emote`… (pendiente).

**Resolución de mapas.** `Data/Locations[nombre].CreateOnLoad.MapPath`, y si no existe, `Maps/<nombre>`.

**Sprite base del granjero** (`Characters/Farmer/farmer_base`, observado del asset): frames de 16 × 32 en filas de 18 columnas. Las filas 0, 1 y 2 son abajo, derecha y arriba, con quieto en la columna 0 y pasos en las columnas 1 y 2. Los brazos están en la misma fila, 6 columnas a la derecha. La izquierda es la derecha espejada (?). Capas (pantalón, camisa, pelo, accesorios) y recoloreo de piel: spec `FarmerRenderer` pendiente.

## Hito 2: resultados (2026-10-21)

- Simulación pura en `src/world/` (`Location`, `step`), testeada sin Phaser, más recorridos de punta a punta con puppeteer (`npm run e2e`): puerta de Pierre ida y vuelta, borde oeste de Town → BusStop y paredes.
- Aproximaciones a validar contra el juego real: offset vertical de la caja (16 px), duración de los frames de caminata (90 ms corriendo y 150 ms caminando) y que la izquierda sea la derecha espejada.
- `LockedDoorWarp` ignora el horario hasta que exista el reloj (hito 3). `Door`, `TouchAction` y el resto de las acciones solo se informan en el HUD.
- El granjero se dibuja solo con cuerpo y brazos base; falta la spec `FarmerRenderer` (ropa, pelo, piel).

## Incógnitas

- Composición exacta de las semillas por sistema.
- Conversión de audio XACT a OGG (herramienta y licencia a definir).
