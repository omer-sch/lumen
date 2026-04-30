# yellowHEAD Design Tokens — Full Reference

## CSS Custom Properties

Paste this into your global stylesheet or `:root` block:

```css
:root {
  /* ── Brand Colors ── */
  --color-yellow:       #FFDD0C;
  --color-navy:         #0A1428;
  --color-white:        #FAFAFA;

  /* Team accent colors */
  --color-ua:           #54F0A3;   /* Mint Green — UA / Paid Media */
  --color-organic:      #926FDE;   /* Vivid Violet — Organic / ASO / SEO */
  --color-creative:     #F88673;   /* Coral Red — Creative Studio */

  /* ── Surfaces (dark theme) ── */
  --surface-base:       #0A1428;   /* Page background */
  --surface-card:       #0D1B35;   /* Card background */
  --surface-elevated:   #112040;   /* Elevated card / dropdown */
  --surface-overlay:    rgba(10, 20, 40, 0.85); /* Modal backdrop */

  /* ── Surfaces (light theme) ── */
  --surface-light-base: #FAFAFA;
  --surface-light-card: #FFFFFF;
  --surface-light-line: #E8ECF2;

  /* ── Text (dark theme) ── */
  --text-primary:       #FAFAFA;
  --text-secondary:     rgba(255, 255, 255, 0.75);
  --text-muted:         rgba(255, 255, 255, 0.45);
  --text-disabled:      rgba(255, 255, 255, 0.25);

  /* ── Text (light theme) ── */
  --text-light-primary: #0A1428;
  --text-light-secondary: rgba(10, 20, 40, 0.65);
  --text-light-muted:   rgba(10, 20, 40, 0.40);

  /* ── Borders / Dividers ── */
  --border-subtle:      rgba(255, 255, 255, 0.08);
  --border-default:     rgba(255, 255, 255, 0.15);
  --border-strong:      rgba(255, 255, 255, 0.30);
  --border-light:       #E8ECF2;

  /* ── Typography ── */
  --font-display:       'Bricolage Grotesque', system-ui, sans-serif;
  --font-body:          'Montserrat', system-ui, sans-serif;

  --font-weight-extrabold: 800;
  --font-weight-bold:      700;
  --font-weight-semibold:  600;
  --font-weight-regular:   400;

  /* Type scale */
  --text-xs:    11px;
  --text-sm:    13px;
  --text-base:  15px;
  --text-md:    17px;
  --text-lg:    20px;
  --text-xl:    24px;
  --text-2xl:   32px;
  --text-3xl:   40px;
  --text-4xl:   56px;

  /* Line heights */
  --leading-tight:   1.15;
  --leading-snug:    1.3;
  --leading-normal:  1.5;
  --leading-relaxed: 1.65;

  /* ── Spacing Scale ── */
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;

  /* ── Border Radius ── */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-card:    0 4px 24px rgba(0, 0, 0, 0.35);
  --shadow-elevated: 0 8px 40px rgba(0, 0, 0, 0.50);
  --shadow-yellow:  0 0 24px rgba(255, 221, 12, 0.20);  /* yellow glow for active/focus */

  /* ── Transitions ── */
  --transition-fast:   150ms ease;
  --transition-base:   250ms ease;
  --transition-slow:   400ms ease;
}
```

---

## Tailwind Config Extension

If using Tailwind CSS:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        yellow:   '#FFDD0C',
        navy:     '#0A1428',
        'cloud-white': '#FAFAFA',
        ua:       '#54F0A3',
        organic:  '#926FDE',
        creative: '#F88673',
        card:     '#0D1B35',
        elevated: '#112040',
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        body:    ['Montserrat', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '20px',
      },
      boxShadow: {
        'card':    '0 4px 24px rgba(0,0,0,0.35)',
        'yellow':  '0 0 24px rgba(255,221,12,0.20)',
      }
    }
  }
}
```

---

## Typography Usage Examples

```css
/* Hero title */
.hero-title {
  font-family: var(--font-display);
  font-weight: var(--font-weight-extrabold);
  font-size: var(--text-4xl);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

/* Section heading */
.section-heading {
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-2xl);
  line-height: var(--leading-snug);
  color: var(--text-primary);
}

/* Sub-header */
.sub-header {
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-md);
  color: var(--text-secondary);
}

/* Body */
.body {
  font-family: var(--font-body);
  font-weight: var(--font-weight-regular);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}

/* KPI number (big metric) */
.kpi-value {
  font-family: var(--font-display);
  font-weight: var(--font-weight-extrabold);
  font-size: var(--text-3xl);
  color: var(--color-yellow);
}
```

---

## Component Patterns

### Card

```css
.card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-card);
}
```

### Primary Button

```css
.btn-primary {
  background: var(--color-yellow);
  color: var(--color-navy);
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-sm);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  border: none;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.btn-primary:hover { opacity: 0.88; }
```

### Secondary Button

```css
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-sm);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.btn-secondary:hover { border-color: var(--border-strong); }
```

### Input Field

```css
.input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  padding: var(--space-3) var(--space-4);
  transition: border-color var(--transition-fast);
}
.input:focus {
  outline: none;
  border-color: var(--color-yellow);
  box-shadow: var(--shadow-yellow);
}
```

### Team Badge / Tag

```css
/* Usage: <span class="badge badge--ua">UA</span> */
.badge {
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-xs);
  border-radius: var(--radius-full);
  padding: 2px var(--space-2);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.badge--ua       { background: rgba(84, 240, 163, 0.15); color: #54F0A3; }
.badge--organic  { background: rgba(146, 111, 222, 0.15); color: #926FDE; }
.badge--creative { background: rgba(248, 134, 115, 0.15); color: #F88673; }
.badge--general  { background: rgba(255, 221, 12, 0.15); color: #FFDD0C; }
```

### Nav Item (Sidebar)

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-weight: var(--font-weight-semibold);
  font-size: var(--text-sm);
  text-decoration: none;
  transition: color var(--transition-fast), background var(--transition-fast);
  border-left: 3px solid transparent;
}
.nav-item:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
}
.nav-item.active {
  color: var(--color-yellow);
  border-left-color: var(--color-yellow);
  background: rgba(255, 221, 12, 0.06);
}
```

### Divider

```css
.divider {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: var(--space-6) 0;
}
```

---

## Chart Color Palette

For Recharts, Chart.js, or any charting library:

```js
export const CHART_COLORS = {
  ua:         '#54F0A3',
  organic:    '#926FDE',
  creative:   '#F88673',
  total:      '#FFDD0C',
  neutral1:   '#FAFAFA',
  neutral2:   'rgba(255,255,255,0.4)',
  grid:       'rgba(255,255,255,0.06)',
  tooltip_bg: '#0D1B35',
}
```

---

## Google Fonts Import

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&family=Montserrat:wght@400;600&display=swap" rel="stylesheet">
```

Or in CSS:
```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&family=Montserrat:wght@400;600&display=swap');
```
