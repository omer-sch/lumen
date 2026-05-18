// ISO 3166-1 alpha-2 country codes mapped to canonical display names.
//
// Used by the Geo query to bridge:
//   - cohort table `_Country` column (full names: "United States")
//   - spend tables `breakdown_value` Country slice (ISO-2: "US")
//
// The mapping is intentionally exhaustive for the ~50 markets that
// drive >99% of marketing spend, with long-tail markets included for
// completeness. Static + server-side, no I/O.

export type IsoCountry = {
  /** ISO 3166-1 alpha-2 (uppercase, what the spend tables use). */
  code: string;
  /** Canonical English name (what the cohort table uses). */
  name: string;
};

/**
 * Reverse lookup: name -> code. Used to translate cohort `_Country`
 * strings into the ISO-2 code the spend side keys on.
 */
export function isoCodeFromName(name: string): string | null {
  return NAME_TO_CODE.get(name.trim()) ?? null;
}

/** Forward lookup: code -> canonical name. */
export function isoNameFromCode(code: string): string | null {
  return CODE_TO_NAME.get(code.trim().toUpperCase()) ?? null;
}

// Compact authoring shape; expanded to maps at module init.
const COUNTRIES: readonly IsoCountry[] = [
  // North America
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  // Western Europe (core markets)
  { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "PT", name: "Portugal" },
  { code: "IE", name: "Ireland" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IS", name: "Iceland" },
  // Eastern Europe
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "SK", name: "Slovakia" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "SI", name: "Slovenia" },
  { code: "RS", name: "Serbia" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  // APAC core
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "TW", name: "Taiwan" },
  { code: "HK", name: "Hong Kong" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  // LATAM
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "UY", name: "Uruguay" },
  { code: "EC", name: "Ecuador" },
  { code: "VE", name: "Venezuela" },
  { code: "BO", name: "Bolivia" },
  { code: "PY", name: "Paraguay" },
  { code: "CR", name: "Costa Rica" },
  { code: "PA", name: "Panama" },
  { code: "DO", name: "Dominican Republic" },
  { code: "GT", name: "Guatemala" },
  // Middle East
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "JO", name: "Jordan" },
  { code: "LB", name: "Lebanon" },
  { code: "EG", name: "Egypt" },
  // Africa
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "GH", name: "Ghana" },
  { code: "MA", name: "Morocco" },
  { code: "TN", name: "Tunisia" },
  { code: "DZ", name: "Algeria" },
  { code: "ET", name: "Ethiopia" },
];

const CODE_TO_NAME = new Map<string, string>(
  COUNTRIES.map((c) => [c.code, c.name]),
);

const NAME_TO_CODE = new Map<string, string>(
  COUNTRIES.map((c) => [c.name, c.code]),
);

export const ALL_ISO_COUNTRIES: readonly IsoCountry[] = COUNTRIES;
