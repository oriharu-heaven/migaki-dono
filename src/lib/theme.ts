import type { Slot } from "../data/types";

const THEME_COLOR: Record<Slot, string> = {
  morning: "#F2EFE6",
  night: "#141A26",
};

/**
 * §4.2 data-slot は <html> に付与する。
 * PWAのステータスバーを背景色に合わせるため theme-color も同時に更新する。
 */
export function applySlotTheme(slot: Slot): void {
  document.documentElement.dataset.slot = slot;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[slot]);
}
