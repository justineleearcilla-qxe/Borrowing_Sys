export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Reads the persisted choice, falling back to the OS preference. The first
 * paint itself is handled by the inline script in index.html, so this only
 * needs to agree with it afterwards.
 */
export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be blocked (private mode); fall through to the OS setting.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

type Listener = (theme: Theme) => void;
const listeners = new Set<Listener>();

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Preference is still applied for this session, just not remembered.
  }
  listeners.forEach((listener) => listener(theme));
}

export function toggleTheme(): void {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

/** Subscribe a component (the toggle) to theme changes made anywhere. */
export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
