import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-navy">
      {/* Ambient brand glow — yellow top-right, mint bottom-left.
          Sets the lively, not-flat tone the brand calls for without dominating. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-20%] h-[640px] w-[640px] rounded-full blur-3xl"
        style={{ background: "var(--color-yellow)", opacity: 0.12 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] h-[640px] w-[640px] rounded-full blur-3xl"
        style={{ background: "var(--color-ua)", opacity: 0.11 }}
      />
      {/* Faint grain to give the navy depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
