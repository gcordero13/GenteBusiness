"use client";

import { useState } from "react";

/**
 * Open state for the user dialogs: their own (they render their own button)
 * or controlled from outside (opened from the row's actions menu).
 */
export function useOpenState(
  openProp: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (open: boolean) => void, boolean] {
  const [own, setOwn] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : own;
  const setOpen = (next: boolean) => {
    if (!controlled) setOwn(next);
    onOpenChange?.(next);
  };
  return [open, setOpen, controlled];
}
