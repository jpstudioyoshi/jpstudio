# Japanese Studio — Style Guide
_Living document. All new UI references this before writing CSS or inline styles._
_Last updated: 2026-05-23_

---

## CSS Variables

### Colors
| Variable | Value | Usage |
|----------|-------|-------|
| `--ink` | `#f5f5f7` | Primary text |
| `--ink-light` | `#c0c0c5` | Secondary text, labels, hints |
| `--paper` | `#1c1c1e` | Primary background |
| `--paper-dark` | `#3d3d40` | Input backgrounds, cards |
| `--paper-mid` | `#4e4e52` | Dividers, subtle backgrounds |
| `--teal` | `#30d5c8` | Primary accent — correct, active, focus |
| `--teal-light` | `#5ee7d0` | Hover states on teal elements |
| `--gold` | `#ffd60a` | Secondary accent — next/advance actions |
| `--gold-light` | `#ffe545` | Hover states on gold elements |
| `--red` | `#ff6b6b` | Error, wrong answer, destructive |
| `--red-light` | `#ff8585` | Hover states on red elements |
| `--sage` | `#7ed886` | Success, positive progress |
| `--border` | `rgba(255,255,255,0.22)` | Subtle borders |
| `--field` | `#111113` | Input field background |
| `--field-border` | `rgba(255,255,255,0.28)` | Input field border |
| `--field-focus` | `#30d5c8` | Input focus ring (= teal) |

### ⚠️ Undefined Variables (needs fixing)
| Variable | Status | Notes |
|----------|--------|-------|
| `--jp` | **Not defined** | Used everywhere for Japanese font. Needs explicit declaration e.g. `'Hiragino Sans', 'Yu Gothic', sans-serif` |
| `--panel` | **Not defined** | Used as background in a few panels. Audit usages and replace or define. |

### Typography
| Variable | Value | Usage |
|----------|-------|-------|
| `--ui` | `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif` | All UI chrome, labels, buttons |
| `--serif` | `Georgia, 'Times New Roman', serif` | Long-form reading content |
| `--jp` | ⚠️ undefined | Japanese text — furigana, kanji, readings |

---

## Color Semantics

| Meaning | Color | Variable |
|---------|-------|----------|
| Correct / active / primary CTA | Teal | `--teal` |
| Advance / next / secondary CTA | Gold | `--gold` |
| Wrong / error / destructive | Red | `--red` |
| Success / streak / mastery | Sage | `--sage` |
| Disabled / hint / secondary | Ink-light | `--ink-light` |

---

## Buttons

### Primary (teal) — `btn-primary`
```css
/* class btn-primary defined in style.css */
```
Use for: Check, Submit, Start drill

### Secondary / advance (gold)
```css
padding: 7px 16px;
background: var(--gold);
border: none;
border-radius: 6px;
color: #1c1c1e;
font-family: var(--ui);
font-size: 0.8rem;
font-weight: 500;
cursor: pointer;
```
Use for: Next →, Go again, Skip

### Destructive (red)
_Pattern: use `--red` text or border, not background, unless confirming deletion._

---

## Inputs

### Standard field
```css
background: var(--field);
border: 1px solid var(--field-border);
border-radius: 8px;
color: var(--ink);
font-family: var(--jp);
outline: none;
```
Focus: `border-color: var(--field-focus)`

### Drill input (centered, large)
```css
width: 100%;
max-width: 280px;
padding: 10px 14px;
font-family: var(--jp);
font-size: 1.1rem;
background: var(--paper-dark);
border: 1px solid var(--border);
border-radius: 8px;
color: var(--ink);
text-align: center;
```

---

## Feedback Patterns

| State | Color | Pattern |
|-------|-------|---------|
| Correct | `--teal` | `✓ {answer}` |
| Wrong | `--red` | `✗ ` + teal answer shown |
| Input border correct | `--teal` | `border-color: var(--teal)` |
| Input border wrong | `--red` | `border-color: var(--red,#e05050)` |

---

## Progress Indicators

### Dot trail (DrillCard style)
```js
// 8px circles, border-radius 50%
// teal = correct, red = wrong, ink = current, border = pending
```

### Stats bar
```
Run X/Y  [dots]  ✓ N  ✗ N
font: var(--ui), 0.78rem, color: var(--ink-light)
```

---

## Typography Scale

| Use | Size | Font |
|-----|------|------|
| Kanji prompt (drill) | `2.2rem` | `--jp` |
| Kanji popup large | `3.5rem` | `--jp` |
| Reading / kana | `1.1rem` | `--jp` |
| Example sentences | `0.9rem` | `--jp` |
| UI labels | `0.78–0.85rem` | `--ui` |
| Body / feedback | `1rem` | `--ui` or `--jp` |

---

## Layout Patterns

### Drill card container
```css
padding: 20px;
```

### Centered drill content
```css
display: flex;
flex-direction: column;
align-items: center;
gap: 10px;
```

### Stats bar
```css
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 12px;
```

---

## Component Inventory
_To be expanded — add component name + file location as each is documented._

| Component | File | Notes |
|-----------|------|-------|
| DrillCard | `src/ui/DrillCard.js` | Shared drill loop, config-driven |
| TextEntry | `src/ui/TextEntry.js` | Kana-aware text input |
| YoshiUI | `src/ui/YoshiUI.js` | Recording panel |
| kanaToolbar | `src/features-kana.js` | Attaches to any input by ID |

---

## Rules for New UI

1. **Always use CSS variables** — never hardcode colors
2. **Check this guide first** — if a pattern exists, reuse it
3. **Inline styles for JS-controlled elements** — immune to stylesheet scope issues
4. **`--jp` font** — fix the undefined variable before adding more Japanese text elements
5. **Buttons** — teal for primary action, gold for advance/next, never both on same card
6. **Feedback** — always show correct answer in teal on wrong, even when marking red
