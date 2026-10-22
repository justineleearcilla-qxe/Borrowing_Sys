import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import type { CartLine, Item } from "../types";

const STORAGE_KEY = "equiphub-cart";
/** Mirrors MAX_BATCH_ITEMS in backend/routes/loans.ts. */
export const MAX_CART_LINES = 25;

interface CartContextValue {
  lines: CartLine[];
  /** Number of distinct items in the cart. */
  count: number;
  /** Total units across all lines. */
  units: number;
  has: (itemId: number) => boolean;
  add: (item: Item, quantity?: number) => void;
  setQuantity: (itemId: number, quantity: number) => void;
  remove: (itemId: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop anything that no longer looks like a cart line.
    return parsed
      .filter(
        (l): l is CartLine =>
          !!l &&
          typeof l === "object" &&
          Number.isInteger((l as CartLine).itemId) &&
          typeof (l as CartLine).name === "string",
      )
      .map((l) => ({ ...l, maxQty: Math.max(1, l.maxQty || 1) }));
  } catch {
    return [];
  }
}

function clampQty(want: number, max: number): number {
  return Math.min(Math.max(1, Math.round(want) || 1), Math.max(1, max));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage full / disabled: the cart still works for this session.
    }
  }, [lines]);

  const add = useCallback((item: Item, quantity = 1) => {
    const max = Math.max(1, item.availableQuantity);
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.itemId === item.id
            ? { ...l, maxQty: max, quantity: clampQty(l.quantity + quantity, max) }
            : l,
        );
      }
      if (prev.length >= MAX_CART_LINES) return prev;
      const line: CartLine = {
        itemId: item.id,
        code: item.code,
        name: item.name,
        imageUrl: item.imageUrl,
        categorySlug: item.category?.slug ?? "",
        maxQty: max,
        quantity: clampQty(quantity, max),
      };
      return [...prev, line];
    });
  }, []);

  const setQuantity = useCallback((itemId: number, quantity: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId
          ? { ...l, quantity: clampQty(quantity, l.maxQty) }
          : l,
      ),
    );
  }, []);

  const remove = useCallback((itemId: number) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.length,
      units: lines.reduce((sum, l) => sum + l.quantity, 0),
      has: (itemId) => lines.some((l) => l.itemId === itemId),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
