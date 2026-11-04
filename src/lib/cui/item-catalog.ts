/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (item picker catalog).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import CATALOG from "./rust-item-catalog.json";

export interface RustItem {
  id: number;
  shortname: string;
  name: string;
  category: number;
}

export const RUST_ITEM_CATALOG = CATALOG as RustItem[];

export const MISC_ITEM_CATEGORY = 10;

export const ITEM_CATEGORIES = [
  { id: 0, labelKey: "itemPicker.catWeapons" },
  { id: 8, labelKey: "itemPicker.catAmmo" },
  { id: 4, labelKey: "itemPicker.catClothing" },
  { id: 5, labelKey: "itemPicker.catTools" },
  { id: 6, labelKey: "itemPicker.catMedical" },
  { id: 7, labelKey: "itemPicker.catFood" },
  { id: 3, labelKey: "itemPicker.catResources" },
  { id: 13, labelKey: "itemPicker.catComponents" },
  { id: 1, labelKey: "itemPicker.catConstruction" },
  { id: 2, labelKey: "itemPicker.catDeployables" },
  { id: 9, labelKey: "itemPicker.catTraps" },
  { id: MISC_ITEM_CATEGORY, labelKey: "itemPicker.catMisc" },
] as const;

const ITEM_BY_ID = new Map<number, RustItem>();
for (const item of RUST_ITEM_CATALOG) {
  if (!ITEM_BY_ID.has(item.id)) ITEM_BY_ID.set(item.id, item);
}

export function itemById(id: number): RustItem | undefined {
  return ITEM_BY_ID.get(id);
}

export function itemCategory(id: number): number {
  return itemById(id)?.category ?? MISC_ITEM_CATEGORY;
}
