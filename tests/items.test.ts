/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (item catalog).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
import { describe, expect, it } from "vitest";
import { ITEM_CATEGORIES, MISC_ITEM_CATEGORY, RUST_ITEM_CATALOG, itemById, itemCategory } from "@/lib/cui/item-catalog";

describe("item catalog", () => {
  it("contains known Rust items with their categories", () => {
    expect(RUST_ITEM_CATALOG.length).toBeGreaterThan(400);
    const ak = itemById(1545779598);
    expect(ak?.shortname).toBe("rifle.ak");
    expect(ak?.name).toBe("Assault Rifle");
    expect(itemCategory(1545779598)).toBe(0);
  });

  it("falls back to the misc category for unknown ids", () => {
    expect(itemCategory(123456789)).toBe(MISC_ITEM_CATEGORY);
    expect(ITEM_CATEGORIES.some((category) => category.id === MISC_ITEM_CATEGORY)).toBe(true);
  });
});
