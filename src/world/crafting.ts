import { parseId, type Item, type ItemData } from "./items.ts";

export interface Recipe {
  name: string;
  cooking: boolean;
  ingredients: { key: string; count: number }[];
  output: string;
  produced: number;
  big: boolean;
  displayName: string | null;
}

export function parseRecipe(name: string, raw: string, cooking: boolean): Recipe {
  const f = raw.split("/");
  const parts = f[0].split(" ").filter((p) => p.length > 0);
  const ingredients: { key: string; count: number }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) ingredients.push({ key: parts[i], count: Number(parts[i + 1]) });
  const big = !cooking && f[3] === "true";
  const out = f[2].split(" ");
  const id = out[0];
  return {
    name,
    cooking,
    ingredients,
    output: id.startsWith("(") ? id : `(${big ? "BC" : "O"})${id}`,
    produced: out[1] ? Number(out[1]) : 1,
    big,
    displayName: f[cooking ? 4 : 5] || null,
  };
}

export function matchesIngredient(item: Item, key: string, objects: ItemData["objects"]) {
  if (key.startsWith("-")) {
    const { type, id } = parseId(item.id);
    return type === "O" && String(objects[id]?.Category ?? 0) === key;
  }
  const qualified = key.startsWith("(") ? key : `(O)${key}`;
  return item.id === qualified;
}

export function countIngredient(inventory: (Item | null)[], key: string, objects: ItemData["objects"]) {
  let n = 0;
  for (const it of inventory) if (it && matchesIngredient(it, key, objects)) n += it.stack;
  return n;
}

export const canCraft = (r: Recipe, inventory: (Item | null)[], objects: ItemData["objects"]) => r.ingredients.every((ing) => countIngredient(inventory, ing.key, objects) >= ing.count);

export function consumeIngredients(r: Recipe, inventory: (Item | null)[], objects: ItemData["objects"]) {
  for (const ing of r.ingredients) {
    let left = ing.count;
    for (let i = 0; i < inventory.length && left > 0; i++) {
      const it = inventory[i];
      if (!it || !matchesIngredient(it, ing.key, objects)) continue;
      const take = Math.min(left, it.stack);
      it.stack -= take;
      left -= take;
      if (it.stack <= 0) inventory[i] = null;
    }
  }
}

export interface RecipeSlot {
  recipe: Recipe;
  page: number;
  col: number;
  row: number;
}

export function layoutRecipes(recipes: Recipe[]) {
  const slots: RecipeSlot[] = [];
  const occupied = new Set<string>();
  let page = 0, col = 0, row = 0;
  const taken = (c: number, r: number, big: boolean) => occupied.has(`${page}:${c}:${r}`) || (big && (r + 1 >= 4 || occupied.has(`${page}:${c}:${r + 1}`)));
  for (const recipe of recipes) {
    while (taken(col, row, recipe.big)) {
      col++;
      if (col >= 10) {
        col = 0;
        row++;
        if (row >= 4) {
          page++;
          row = 0;
        }
      }
    }
    slots.push({ recipe, page, col, row });
    occupied.add(`${page}:${col}:${row}`);
    if (recipe.big) occupied.add(`${page}:${col}:${row + 1}`);
  }
  return slots;
}
