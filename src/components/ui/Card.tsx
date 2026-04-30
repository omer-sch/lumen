import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg shadow-card",
        "transition-colors",
        className
      )}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
      }}
      {...props}
    />
  );
}
