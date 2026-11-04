/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool вЂ” added 2026-11-04 (visual item picker).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import clsx from "clsx";
import { Check, ChevronDown, Package, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useItemIcon, useItemAssets } from "@/lib/assets/items";
import {
  ITEM_CATEGORIES,
  RUST_ITEM_CATALOG,
  itemById,
  type RustItem,
} from "@/lib/cui/item-catalog";
import { useT } from "@/lib/i18n/useT";
import { Button, Dialog } from "@/components/ui/primitives";
import { NumberInput, inputCls } from "./fields";

function ItemThumb({ id, item, size = "size-10" }: { id: number; item?: RustItem; size?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const url = useItemIcon(id, visible);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <span ref={ref} className={clsx("grid shrink-0 place-items-center overflow-hidden rounded-lg bg-black/35", size)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} className="size-full object-contain p-0.5" />
      ) : (
        <Package className="size-4 text-faint" strokeWidth={1.75} aria-label={item?.shortname} />
      )}
    </span>
  );
}

export function ItemPicker({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: number;
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  const hasFolder = useItemAssets((s) => Boolean(s.path));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<number | "all">("all");

  const close = () => {
    setQuery("");
    setCategory("all");
    onClose();
  };

  const choose = (id: number) => {
    onSelect(id);
    close();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RUST_ITEM_CATALOG;
    return RUST_ITEM_CATALOG.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.shortname.toLowerCase().includes(q) ||
        String(item.id).includes(q),
    );
  }, [query]);

  const groups = useMemo(
    () =>
      ITEM_CATEGORIES.map((cat) => ({
        ...cat,
        items: visible.filter((item) => item.category === cat.id),
      })).filter((group) => group.items.length > 0 && (category === "all" || group.id === category)),
    [category, visible],
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      icon={<Package />}
      title={t("itemPicker.title")}
      subtitle={t("itemPicker.subtitle")}
      footer={
        <>
          <span className="text-[11.5px] text-faint">{t("itemPicker.found", { count: visible.length })}</span>
          {value !== 0 && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => choose(0)}>
              {t("itemPicker.clear")}
            </Button>
          )}
        </>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-panel px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && visible.length === 1) choose(visible[0].id);
            }}
            placeholder={t("itemPicker.searchPlaceholder")}
            spellCheck={false}
            className={clsx(inputCls, "h-8 pl-8")}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={clsx(
              "rounded-md border px-2 py-1 text-[11.5px] font-medium transition",
              category === "all"
                ? "border-rust/60 bg-rust/15 text-rust-hi"
                : "border-line bg-white/3 text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {t("itemPicker.all")}
          </button>
          {ITEM_CATEGORIES.map((cat) => {
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={clsx(
                  "rounded-md border px-2 py-1 text-[11.5px] font-medium transition",
                  category === cat.id
                    ? "border-rust/60 bg-rust/15 text-rust-hi"
                    : "border-line bg-white/3 text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {t(cat.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 p-5">
        {!hasFolder && (
          <div className="rounded-xl border border-dashed border-line-strong bg-black/20 px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            {t("itemPicker.noFolder")}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-faint">{t("itemPicker.empty")}</div>
        ) : (
          groups.map((group) => (
            <section key={group.id}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">
                  {t(group.labelKey)}
                </h3>
                <span className="rounded-full bg-white/6 px-1.5 py-0.5 font-mono text-[10px] text-faint">
                  {group.items.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const selected = item.id === value;
                  return (
                    <button
                      key={`${item.id}-${item.shortname}`}
                      type="button"
                      onClick={() => choose(item.id)}
                      className={clsx(
                        "group flex min-w-0 items-center gap-2.5 rounded-xl border p-2 text-left transition",
                        selected
                          ? "border-rust/60 bg-rust/10"
                          : "border-line bg-white/3 hover:border-rust/40 hover:bg-white/6",
                      )}
                    >
                      <ItemThumb id={item.id} item={item} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-fg/90">{item.name}</span>
                        <span className="block truncate font-mono text-[10px] text-faint">{item.shortname}</span>
                        <span className="block truncate font-mono text-[9.5px] text-faint/70">#{item.id}</span>
                      </span>
                      {selected && <Check className="size-3.5 shrink-0 text-rust-hi" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}

/** Compact item ID control: icon + name button that opens the catalog, plus manual ID input. */
export function ItemIdField({ value, onChange }: { value: number; onChange: (id: number) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const item = itemById(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-line bg-black/25 px-1.5 text-left transition hover:border-line-strong focus:border-rust/70 focus:outline-none"
          title={item ? `${item.name} · ${item.shortname}` : t("itemPicker.choose")}
        >
          <ItemThumb id={value} item={item} size="size-5" />
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg/90">
            {item?.name ?? (value ? `#${value}` : t("itemPicker.choose"))}
          </span>
          <ChevronDown className="size-3 shrink-0 text-faint transition group-hover:text-fg" />
        </button>
        <div className="w-28 shrink-0">
          <NumberInput value={value} precision={0} onChange={onChange} />
        </div>
      </div>
      {item && <div className="truncate font-mono text-[10px] text-faint">{item.shortname}</div>}
      <ItemPicker open={open} value={value} onClose={() => setOpen(false)} onSelect={onChange} />
    </div>
  );
}
