import type { AccentName, ThemeMode } from "./models";
import { getConfig, saveConfig } from "./storage";

export const ACCENTS: { name: AccentName; label: string; color: string }[] = [
  { name: "slate", label: "Slate", color: "#4f5b93" },
  { name: "sage", label: "Sage", color: "#4a7c59" },
  { name: "clay", label: "Clay", color: "#a15c4a" },
  { name: "plum", label: "Plum", color: "#6d5192" },
  { name: "ocean", label: "Ocean", color: "#3f6f8f" },
  { name: "graphite", label: "Graphite", color: "#4b5560" }
];

// Stamp the current theme onto <html>. "system" leaves data-theme off so the
// prefers-color-scheme media query decides. "slate" is the default accent, so
// it needs no attribute either.
const stamp = (theme: ThemeMode, accent: AccentName) => {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  if (accent === "slate") root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", accent);
};

export const applyStoredTheme = async (): Promise<void> => {
  const config = await getConfig();
  stamp(config.theme ?? "system", config.accent ?? "slate");
};

export const setTheme = async (partial: { theme?: ThemeMode; accent?: AccentName }): Promise<void> => {
  const config = await getConfig();
  const next = { ...config, ...partial };
  await saveConfig(next);
  stamp(next.theme ?? "system", next.accent ?? "slate");
};

// React to changes made from another surface (e.g. options page while panel is open).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.appConfig) applyStoredTheme();
});
