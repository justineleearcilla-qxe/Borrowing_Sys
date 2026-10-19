import { useEffect, useState } from "react";
import clsx from "clsx";
import { Icon } from "./Icon";
import { getTheme, setTheme, subscribeTheme, type Theme } from "../lib/theme";

/**
 * Light/dark switch. Two placements: the navy sidebar needs light text in
 * both themes, while the top bar sits on a light (or dark) surface and can
 * reuse the theme-aware `.btn-secondary` styles.
 */
export function ThemeToggle({
  variant = "header",
  className,
}: {
  variant?: "sidebar" | "header";
  className?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  useEffect(() => subscribeTheme(setThemeState), []);

  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      aria-pressed={dark}
      className={clsx(
        "btn btn-sm inline-flex items-center gap-2",
        variant === "sidebar"
          ? "border-white/20 bg-white/10 text-slate-100 hover:border-white/40 hover:bg-white/20 hover:text-white focus-visible:ring-white/50"
          : "btn-secondary",
        className,
      )}
    >
      <Icon name={dark ? "sun" : "moon"} className="h-4 w-4" />
      {variant !== "sidebar" && (dark ? "Light" : "Dark")}
    </button>
  );
}
