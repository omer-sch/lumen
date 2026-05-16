"use client";

import { useCallback, useState } from "react";
import { Plus, Power, Trash2 } from "lucide-react";

type FilterRow = {
  id: string;
  type: "sender_email" | "sender_domain";
  value: string;
  active: boolean;
};

type Props = {
  initialFilters: FilterRow[];
};

export function GmailFiltersPanel({ initialFilters }: Props) {
  const [filters, setFilters] = useState<FilterRow[]>(initialFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"sender_domain" | "sender_email">(
    "sender_domain",
  );
  const [value, setValue] = useState("");

  const handleAdd = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/email-filters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { filter: FilterRow };
        setFilters((cur) =>
          cur.find((f) => f.id === body.filter.id)
            ? cur.map((f) => (f.id === body.filter.id ? body.filter : f))
            : [body.filter, ...cur],
        );
        setValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Add failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, type, value],
  );

  const handleToggle = useCallback(
    async (id: string, nextActive: boolean) => {
      setFilters((cur) =>
        cur.map((f) => (f.id === id ? { ...f, active: nextActive } : f)),
      );
      await fetch(`/api/email-filters/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    setFilters((cur) => cur.filter((f) => f.id !== id));
    await fetch(`/api/email-filters/${id}`, { method: "DELETE" });
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center"
        style={{
          background: "var(--surface-glass)",
          border: "1px solid var(--border-glass)",
        }}
      >
        <select
          aria-label="Filter type"
          value={type}
          onChange={(e) =>
            setType(e.target.value as "sender_domain" | "sender_email")
          }
          className="rounded-md border border-[color:var(--border-default)] bg-[color:var(--surface-input)] px-2 py-1.5 font-body text-xs text-cloud-white focus:border-[color:var(--color-ua)] focus:outline-none"
        >
          <option value="sender_domain">Sender domain</option>
          <option value="sender_email">Sender email</option>
        </select>
        <input
          aria-label="Filter value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            type === "sender_domain"
              ? "globalcomix.com"
              : "emily@globalcomix.com"
          }
          className="min-w-0 flex-1 rounded-md border border-[color:var(--border-default)] bg-[color:var(--surface-input)] px-3 py-1.5 font-body text-sm text-cloud-white placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--color-ua)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[color:var(--color-ua)] px-3 py-1.5 font-body text-xs font-semibold uppercase tracking-wider text-navy shadow-mint transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Add
        </button>
      </form>
      {error && (
        <p
          role="alert"
          className="font-body text-xs text-[color:var(--color-creative)]"
        >
          {error}
        </p>
      )}
      {filters.length === 0 ? (
        <div
          className="rounded-lg p-6 text-center font-body text-sm text-[color:var(--text-secondary)]"
          style={{
            background: "var(--surface-glass)",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          No filters yet. Add a sender domain (e.g. globalcomix.com) to
          start receiving Hermes drafts.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filters.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{
                background: "var(--surface-glass)",
                border: "1px solid var(--border-glass)",
                opacity: f.active ? 1 : 0.55,
              }}
            >
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  background: "var(--surface-input)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {f.type === "sender_domain" ? "Domain" : "Email"}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-cloud-white">
                {f.value}
              </span>
              <button
                type="button"
                onClick={() => handleToggle(f.id, !f.active)}
                aria-label={f.active ? "Pause filter" : "Enable filter"}
                title={f.active ? "Pause" : "Enable"}
                className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)]"
              >
                <Power className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(f.id)}
                aria-label="Delete filter"
                title="Delete"
                className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--color-creative)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-creative)]"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
