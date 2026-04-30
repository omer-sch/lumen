import type { Metadata } from "next";
import { Bricolage_Grotesque, Montserrat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import "@/lib/env.client";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lumen — yellowHEAD",
  description: "AI-powered performance dashboard for yellowHEAD",
};

// Explicit elements map — `baseTheme: dark` alone leaves several Clerk slots in
// light-theme defaults, producing near-black text on our navy card. Every
// element below is wired to brand tokens so the auth widget reads as Lumen,
// not as a stock Clerk form bolted onto a navy background.
const clerkElements = {
  rootBox: "w-full",
  card:
    "bg-transparent border-0 shadow-none p-0",
  // Header
  header: "text-center mb-2",
  headerTitle: "hidden",
  headerSubtitle: "hidden",
  // Social buttons row
  socialButtonsBlockButton:
    "bg-card border border-subtle text-cloud-white hover:bg-elevated transition-colors h-11 rounded-md font-body text-sm",
  socialButtonsBlockButtonText: "text-cloud-white font-medium",
  socialButtonsProviderIcon: "w-4 h-4",
  // Divider "or"
  dividerLine: "bg-subtle h-px",
  dividerText:
    "text-[color:var(--text-muted)] text-xs uppercase tracking-wider px-3",
  // Form fields
  formFieldLabel:
    "text-[color:var(--text-secondary)] text-xs font-semibold uppercase tracking-wider",
  formFieldLabelRow: "mb-1",
  formFieldInput:
    "bg-card border border-subtle text-cloud-white placeholder:text-[color:var(--text-muted)] rounded-md h-11 px-3 focus:border-yellow focus:ring-2 focus:ring-yellow/30 outline-none transition-colors",
  formFieldInputShowPasswordButton:
    "text-[color:var(--text-muted)] hover:text-cloud-white",
  formFieldHintText: "text-[color:var(--text-muted)] text-xs",
  formFieldErrorText: "text-creative text-xs",
  formFieldAction: "text-yellow hover:text-yellow font-semibold text-xs",
  formFieldSuccessText: "text-ua text-xs",
  // OTP code input boxes
  otpCodeFieldInput:
    "bg-card border border-subtle text-cloud-white rounded-md focus:border-yellow",
  // Primary CTA — yellow with navy text per brand
  formButtonPrimary:
    "bg-yellow text-navy hover:bg-yellow font-body font-semibold rounded-md h-11 normal-case shadow-yellow transition-transform active:scale-[0.99]",
  // Secondary buttons (e.g. resend code)
  formButtonReset:
    "bg-transparent border border-subtle text-cloud-white hover:bg-[color:var(--surface-hover)]",
  // Anchors / links
  footer: "bg-transparent",
  footerAction: "text-[color:var(--text-secondary)] text-sm",
  footerActionText: "text-[color:var(--text-secondary)]",
  footerActionLink: "text-yellow hover:text-yellow font-semibold",
  identityPreview:
    "bg-card border border-subtle text-cloud-white rounded-md",
  identityPreviewEditButton: "text-yellow hover:text-yellow",
  // Phone / select dropdowns (kept in case re-enabled later)
  selectButton:
    "bg-card border border-subtle text-cloud-white rounded-md hover:bg-[color:var(--surface-hover)]",
  selectOption:
    "text-cloud-white hover:bg-[color:var(--surface-hover)]",
  // Dev-mode badge — keep visible but muted
  badge: "bg-[color:var(--surface-hover)] text-[color:var(--text-muted)]",
  // Internal Clerk surfaces
  alert:
    "bg-[color:var(--tint-danger-soft)] border border-creative text-creative rounded-md",
  alertText: "text-creative",
  modalBackdrop: "bg-black/60 backdrop-blur-sm",
  modalContent:
    "bg-card border border-subtle text-cloud-white rounded-lg",
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
      afterSignOutUrl="/sign-in"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#FFDD0C",
          colorBackground: "#0A1428",
          colorInputBackground: "#0D1B35",
          colorInputText: "#FAFAFA",
          colorText: "#FAFAFA",
          colorTextSecondary: "rgba(255,255,255,0.75)",
          colorTextOnPrimaryBackground: "#0A1428",
          colorNeutral: "#FAFAFA",
          colorDanger: "#F88673",
          colorSuccess: "#54F0A3",
          colorWarning: "#FFDD0C",
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          fontFamilyButtons: "var(--font-montserrat), system-ui, sans-serif",
          fontWeight: { normal: "400", medium: "600", bold: "700" },
          borderRadius: "10px",
          spacingUnit: "1rem",
        },
        elements: clerkElements,
      }}
    >
      <html lang="en" className={`${bricolage.variable} ${montserrat.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
