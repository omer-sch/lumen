// Diagnostic: shows env key shape WITHOUT leaking the value.
// Run: node --env-file=.env.local scripts/check-env.mjs
const keys = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"];

for (const k of keys) {
  const v = process.env[k];
  if (!v) {
    console.log(`${k}: ❌ MISSING`);
    continue;
  }
  const prefix = v.slice(0, 8);
  const length = v.length;
  const looksLikePlaceholder = v.includes("REPLACE_ME") || v.includes("xxxx");
  const hasQuotes = v.startsWith('"') || v.startsWith("'");
  const hasSpace = v.includes(" ");
  const expectedPrefix = k.includes("PUBLISHABLE") ? "pk_" : "sk_";
  const startsRight = v.startsWith(expectedPrefix);
  console.log(
    `${k}:\n` +
      `  starts with: "${prefix}…"  (expected: "${expectedPrefix}…") ${startsRight ? "✅" : "❌"}\n` +
      `  length: ${length}\n` +
      `  placeholder text? ${looksLikePlaceholder ? "❌ YES" : "✅ no"}\n` +
      `  wrapping quotes? ${hasQuotes ? "❌ YES" : "✅ no"}\n` +
      `  contains space? ${hasSpace ? "❌ YES" : "✅ no"}`
  );
}
