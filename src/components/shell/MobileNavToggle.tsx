"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const EVENT = "lumen:toggle-sidebar";

/** Listen for toggles from anywhere (e.g. closing on link click). */
export function listenSidebarToggle(handler: (open: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => handler((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVENT, onEvent);
  return () => window.removeEventListener(EVENT, onEvent);
}

export function dispatchSidebar(open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: open }));
}

export function MobileNavToggle() {
  const [open, setOpen] = useState(false);

  // Close on route change isn't trivial here without a hook —
  // Sidebar listens for clicks and closes itself.
  useEffect(() => listenSidebarToggle(setOpen), []);

  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      onClick={() => dispatchSidebar(!open)}
      className="grid h-9 w-9 place-items-center rounded-md border border-subtle text-[color:var(--text-secondary)] transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy md:hidden"
    >
      {open ? <X className="h-4 w-4" strokeWidth={2} /> : <Menu className="h-4 w-4" strokeWidth={2} />}
    </button>
  );
}
