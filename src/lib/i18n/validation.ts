/* SPDX-License-Identifier: GPL-3.0-only
 * RustCuiTool — added 2026-11-04 (localization).
 * Part of RustCuiTool, distributed under GNU GPL v3 (see LICENSE).
 */

import type { Problem } from "@/lib/cui/serialize";
import { translateDynamic, type Lang } from "./dictionary";

/** Localized text for a validation problem. */
export function problemText(problem: Problem, lang: Lang): string {
  return translateDynamic(lang, `validation.${problem.key}`, problem.params);
}
