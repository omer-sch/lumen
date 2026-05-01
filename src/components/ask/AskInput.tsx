"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type AskInputProps = {
  onAsk: (question: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export function AskInput({ onAsk, disabled, placeholder, autoFocus }: AskInputProps) {
  const [value, setValue] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    if (!q || disabled) return;
    onAsk(q);
    setValue("");
  };

  return (
    <GlassCard glow="ua" feature shimmer bezel className="w-full p-3">
      <form
        aria-label="Ask Lumen"
        className="flex items-center gap-2"
        onSubmit={submit}
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask Lumen
        </label>
        <input
          id="ask-input"
          name="q"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            placeholder ?? "Ask about a metric, channel, campaign, or trend…"
          }
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1 rounded-md px-3 py-2 font-body text-sm text-cloud-white outline-none transition-[border-color,box-shadow] duration-280 ease-out-quart placeholder:text-[color:var(--text-muted)] focus:border-ua focus:shadow-mint disabled:cursor-not-allowed"
          style={{
            background: "var(--surface-input)",
            border: "1px solid var(--border-default)",
          }}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="group/btn inline-flex items-center gap-1.5 rounded-md bg-yellow px-4 py-2 font-body text-sm font-semibold text-navy shadow-yellow transition-[transform,opacity,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          Ask
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-280 ease-out-quart group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-px"
            strokeWidth={2.25}
          />
        </button>
      </form>
    </GlassCard>
  );
}
