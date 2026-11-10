"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CART_STORAGE_KEY,
  cartCount,
  normalizeCartLines,
  removeCartLine,
  upsertCartLine,
  type CartLine,
} from "@/services/cart/cart";

/**
 * The course cart — a client-side wish list that becomes ONE Paystack charge.
 *
 * No database row exists until the student checks out. `localStorage` is the
 * only store, so the cart survives a refresh, a sign-in round trip and a
 * Paystack redirect. Every read goes through `normalizeCartLines`, so a
 * corrupt or hand-edited value can never reach checkout (and the server
 * re-prices every line anyway).
 *
 * The provider lives in the root layout: the directory, a tutor profile and
 * the course page all need to add to the same cart, signed in or not.
 */
interface CartContextValue {
  lines: CartLine[];
  count: number;
  add: (line: CartLine) => void;
  remove: (tutorServiceId: string) => void;
  clear: () => void;
  /** True for admin accounts: admins are staff and never book, so every cart
   *  and booking control hides itself and `add` does nothing. Switched on by
   *  `CartAccessGate` in the navs (which know who is signed in); the server
   *  refuses admin checkouts regardless. */
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? normalizeCartLines(JSON.parse(raw)) : [];
  } catch {
    // Private mode, disabled storage, or a hand-edited value — an empty cart
    // is always recoverable (the student can add the course again).
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    // Read from localStorage on first render (client-side only).
    if (typeof window === "undefined") return [];
    return readStorage();
  });

  // Persist after changes. The initial state already comes from localStorage.
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage full or unavailable — the in-memory cart still works for this
      // page, which is enough to complete checkout.
    }
  }, [lines]);

  // Keep two open tabs in sync: adding on /tutors updates the header count in
  // the /cart tab without a refresh.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      try {
        setLines(event.newValue ? normalizeCartLines(JSON.parse(event.newValue)) : []);
      } catch {
        setLines([]);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [disabled, setDisabled] = useState(false);

  const add = useCallback(
    (line: CartLine) => {
      if (disabled) return;
      setLines((current) => upsertCartLine(current, line));
    },
    [disabled],
  );

  const remove = useCallback((tutorServiceId: string) => {
    setLines((current) => removeCartLine(current, tutorServiceId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      count: cartCount(lines),
      add,
      remove,
      clear,
      disabled,
      setDisabled,
    }),
    [lines, add, remove, clear, disabled],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Rendered by the navs with the signed-in viewer's admin status: switches the
 * cart off for admins (and back on if a different, non-admin user signs in
 * in the same tab). Renders nothing.
 */
export function CartAccessGate({ disabled }: { disabled: boolean }) {
  const { setDisabled } = useCart();
  useEffect(() => {
    setDisabled(disabled);
  }, [disabled, setDisabled]);
  return null;
}
