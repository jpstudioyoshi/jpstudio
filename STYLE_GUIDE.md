# Japanese Studio — Style Guide

## CSS Variables (Design Tokens)

### Colours
| Token | Value | Usage |
|-------|-------|-------|
| `--ink` | #f5f5f7 | Primary text |
| `--ink-light` | #c0c0c5 | Secondary text, placeholders, disabled |
| `--teal` | #30d5c8 | Primary accent — correct, active, selected |
| `--teal-light` | #5ee7d0 | Teal highlights |
| `--gold` | #ffd60a | Secondary accent — partial, warning, kata |
| `--gold-light` | #ffe545 | Gold highlights |
| `--red` | #ff6b6b | Error, wrong, delete, danger |
| `--red-light` | #ff8585 | Red highlights |
| `--sage` | #7ed886 | Positive/bonus indicators |

### Surfaces
| Token | Value | Usage |
|-------|-------|-------|
| `--paper` | #1c1c1e | Base background |
| `--paper-dark` | #3d3d40 | Elevated surface, selected rows |
| `--paper-mid` | #4e4e52 | Hover background, subtle surface |
| `--panel` | #2c2c2e | Panel background |
| `--field` | #111113 | Input background |
| `--border` | rgba(255,255,255,0.22) | Default border |
| `--field-border` | rgba(255,255,255,0.28) | Input border |
| `--field-focus` | #30d5c8 | Input focus border (teal) |

### Typography
| Token | Usage |
|-------|-------|
| `--ui` | UI text — buttons, labels, navigation |
| `--jp` | Japanese text — Hiragino Sans, Yu Gothic |
| `--serif` | Serif text — reading panel, prose |

### Font Size Scale
| Token | Value | Class | Usage |
|-------|-------|-------|-------|
| `--fs-1` | 0.72rem | `.fs-1` | Small labels — timestamps, tags, counters |
| `--fs-2` | 0.85rem | `.fs-2` | Secondary text — hints, subtitles |
| `--fs-3` | 1.0rem | `.fs-3` | Standard body text |
| `--fs-body` | 1.1rem | `.fs-body` | Readable body — Claude responses, Q&A answers |
| `--fs-4` | 1.4rem | `.fs-4` | Large display — headings, featured text |

Apply to a container div — children inherit via `.fs-N *` wildcard rule:
```html
<div class="fs-body">Claude's answer renders here at readable size.</div>
```
Base font: `html { font-size: 17px; }`

---

## Button Classes

### The Real System — What's Actually Used

> **Note:** The codebase uses `btn-action` as the standard button throughout `index.html`.
> `btn-primary`, `btn-ghost` etc. are the intended system and should be used in new work.
> Migration from `btn-action` is gradual — both coexist.

---

### `.btn-action` ← de facto standard (used throughout index.html)
Ghost style with teal fill on hover. Equivalent to `btn-ghost` + teal hover.
```html
<button class="btn-action" onclick="...">Check</button>
```
Modifiers: add `.btn-sm` or `.btn-xs` for smaller sizes.

### `.btn-primary` ← use for new Send / main CTA buttons
Solid teal background. Use for the primary action in a context (Send, Submit, Generate).
```html
<button class="btn-primary" onclick="...">Send</button>
```
Hover: 0.85 opacity. Disabled: 0.4 opacity.

### `.btn-ghost`
Bordered, transparent. Secondary actions. Teal border/text on hover.
```html
<button class="btn-ghost" onclick="...">Check</button>
```
Add `.btn-ghost-teal` for explicit teal hover variant.

### `.btn-danger` / `.btn-destructive`
Red bordered. Use for destructive actions (delete, reset, clear).
```html
<button class="btn-danger" onclick="...">Delete</button>
```
`btn-destructive` is the inline variant — red fill on hover.

### `.btn-subtle`
No border, `--ink-light` text. Low-priority or contextual actions.
```html
<button class="btn-subtle" onclick="...">Details</button>
```
Hover: `--ink`.

### `.btn-icon`
Minimal icon button, 0.85 opacity at rest. Use for ✎ edit and ✕ delete inline.
```html
<button class="btn-icon" onclick="...">✕</button>
```
Add `.btn-icon-teal` for teal on hover (edit). Add `.btn-icon-del` for red on hover (delete).

### `.btn-toggle`
Wraps a checkbox or radio input — visually a button, semantically a toggle.
```html
<button class="btn-toggle" onclick="...">Loop</button>
```
Active state: add `.toggle-on` or checked input triggers `.btn-toggle:has(input:checked)`.

### `.btn-group`
Segmented group button — one of several mutually exclusive options.
```html
<button class="btn-group btn-active" onclick="...">JP→EN</button>
```
Active state: `.btn-active` (teal) or `.btn-active-gold` (gold).

### `.btn-nav`
Navigation step button — Next, Back, Skip. Ghost style, no hover fill.
```html
<button class="btn-nav" onclick="...">Next →</button>
```
Disabled: 0.3 opacity.

### `.btn-kana`
Kana mode selector: A / ひ / カ. Used across kana inputs.
```html
<button class="btn-kana btn-active" onclick="...">ひ</button>
```

### `.btn-rating` / `.btn-rating-teal` / `.btn-rating-red`
SRS review rating buttons. Colour signals the rating outcome.
```html
<button class="btn-rating btn-rating-teal" onclick="...">Know</button>
<button class="btn-rating btn-rating-red" onclick="...">Again</button>
```

### Size Modifiers
Add to any button class:
| Class | Effect |
|-------|--------|
| `.btn-sm` | `font-size: 0.75rem`, `padding: 3px 8px` |
| `.btn-xs` | `font-size: 0.65rem`, `padding: 1px 6px` |

---

## State Classes

### Active / Selected
| Class | Colour | Usage |
|-------|--------|-------|
| `.btn-active` | Teal | Selected button in a group (hira mode, direction toggle) |
| `.btn-active-gold` | Gold | Selected button — kata mode |
| `.btn-active-red` | Red | Wrong answer button state |
| `.toggle-on` | Teal | Toggle button in ON state (loop, shadowing, dictation) |

### Drill Feedback
| Class | Colour | Usage |
|-------|--------|-------|
| `.result-correct` | Teal | Correct answer text |
| `.result-wrong` | Red | Wrong answer text |
| `.result-partial` | Gold | Partial / hint used text |

### Input States
| Class | Usage |
|-------|-------|
| `.input-correct` | Teal border — correct input |
| `.input-error` | Red border — validation error |

---

## Row / List Classes

| Class | Usage |
|-------|-------|
| `.row-hover` | Paper-dark bg on hover — default list rows |
| `.row-hover-teal` | Teal-tinted bg on hover — vocab/corpus rows |
| `.row-hover-gold` | Gold-tinted bg on hover |
| `.row-hover-border` | Teal border on hover — card/story items |
| `.error-row` | Subtle white bg on hover — error list items |

---

## Special Components

### `.voice-upload-btn`
Circular upload button for voice panel. Gold border on hover.

### `.fe-del`
Inline delete button. Red on hover (via `.fe-del:hover`).

### `.select-std`
Minimal select — no background, bottom border only.
```html
<select class="select-std">...</select>
```

### `.select-field`
Full field-style select with background and border.
```html
<select class="select-field">...</select>
```

---

## Rules for New Features

1. **Never write inline hover handlers** — use a CSS class instead
2. **Button hierarchy for new work:** `btn-primary` → `btn-action` → `btn-subtle` → `btn-icon`
3. **Send buttons are always `btn-primary`**
4. **Colour meaning is fixed:** teal = correct/active, gold = partial/secondary, red = wrong/danger
5. **New utility classes** go at the bottom of style.css in the utility block
6. **JS-controlled visibility** (show/hide) stays as inline style — immune to CSS scope issues
7. **Cross-file calls** use `(App.fn || window.fn)?.()`— never bare globals
8. **Font sizes:** use `--fs-N` tokens and `.fs-N` classes on containers — do not write inline font-size for body text

---

## Do Not Touch

- Status indicator dots — colour IS their meaning
- Recording button gradients — animation states
- Progress bar backgrounds — dynamic values set by JS
- Canvas/waveform drawing colours
- `core-listen.js` solid-fill active states
- `features-stroke.js` cssText elements

---

## Dev Tools

### Right-click element inspector
A script at the bottom of `index.html` adds a right-click handler to every element.
Right-clicking any element copies its reference to clipboard and shows a teal toast:
- If element has an `id` → copies `#id`
- Otherwise → copies `tag.class1.class2`

Use the copied reference directly in:
- `grep -n "#id"` or `grep -n "\.classname"` to find in index.html
- CSS rules in style.css
- Python patch scripts

Toggle: currently always-on. If it interferes with a panel's native context menu, add a keyboard shortcut toggle.
