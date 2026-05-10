// Flat ESLint config (ESLint 9). Bridges Next.js's classic
// `eslint-config-next` shareable config via FlatCompat so we don't
// depend on the deprecated `next lint` CLI in CI.
//
// CI runs: `npx eslint . --max-warnings 0`
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "tests/.auth/**",
      "public/**",
      "next-env.d.ts",
      // Claude Code skills/tooling — user-installed, not project source.
      ".claude/**",
      // One-off scripts that aren't part of the deployed app.
      "scripts/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
