/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (pages, interactions, preview).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */
"use client";

import { create } from "zustand";
import { createSim, simulateClick, type SimState } from "@/lib/cui/simulate";
import type { Project } from "@/lib/cui/types";

/**
 * Preview runtime. Kept out of the document store on purpose: simulating a
 * click must never create undo history or mark the project dirty.
 */
interface RuntimeState {
  sim: SimState | null;
  start(project: Project): void;
  stop(): void;
  restart(project: Project): void;
  click(project: Project, nodeId: string): void;
}

export const useRuntime = create<RuntimeState>()((set) => ({
  sim: null,
  start: (project) => set({ sim: createSim(project) }),
  stop: () => set({ sim: null }),
  restart: (project) => set({ sim: createSim(project) }),
  click: (project, nodeId) =>
    set((s) => ({ sim: s.sim ? simulateClick(project, s.sim, nodeId) : null })),
}));

export const usePreviewActive = () => useRuntime((s) => s.sim !== null);
