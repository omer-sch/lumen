export type Vertical = "Gaming" | "eCommerce" | "Fintech" | "Health & Fitness";

export type Client = {
  slug: string;
  name: string;
  vertical: Vertical;
};

/**
 * Demo client roster. Reflects yellowHEAD's actual vertical mix (Gaming,
 * eCommerce, Fintech, Health & Fitness). The slug is what flows through
 * the URL filter.
 */
export const CLIENTS: Client[] = [
  { slug: "all",         name: "All clients",      vertical: "Gaming" },
  { slug: "lumi-runner", name: "Lumi Runner",      vertical: "Gaming" },
  { slug: "starforge",   name: "Starforge Studio", vertical: "Gaming" },
  { slug: "kindle-pay",  name: "Kindle Pay",       vertical: "Fintech" },
  { slug: "altura",      name: "Altura",           vertical: "eCommerce" },
  { slug: "everstride",  name: "Everstride",       vertical: "Health & Fitness" },
];

export const findClient = (slug: string): Client =>
  CLIENTS.find((c) => c.slug === slug) ?? CLIENTS[0];
