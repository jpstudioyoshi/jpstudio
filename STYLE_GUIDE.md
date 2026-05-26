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

---

## Button Classes

### `.btn-primary`
Solid teal background. Use for the main action in a panel.
```html
<button class="btn-primary" onclick="...">Generate</button>
```

### `.btn-ghost`
Bordered, transparent background. Default button for most actions.
```html
<button class="btn-ghost" onclick="...">Check</button>
```
Hover: ink colour. Disabled: 0.4 opacity.

### `.btn-ghost-teal`
Add alongside `.btn-ghost` for teal hover variant.
```html
<button class="btn-ghost btn-ghost-teal" onclick="...">Copy</button>
```

### `.btn-danger`
Red bordered button. Use for destructive actions.
```html
<button class="btn-danger" onclick="...">Delete</button>
```

### `.btn-subtle`
No border, ink-light text. Use for low-priority actions.
```html
<button class="btn-subtle" onclick="...">Details</button>
```
Hover: ink colour.

### `.btn-icon`
Circular icon button, 0.5 opacity at rest. Use for ✎ edit and ✕ delete icons.
```html
<button class="btn-icon" onclick="...">✕</button>
```
Hover: opacity 1.

### `.btn-icon-teal`
Add alongside `.btn-icon` for edit buttons — teal on hover.
```html
<button class="btn-icon btn-icon-teal" title="Edit">✎</button>
```

### `.btn-icon-del`
Add alongside `.btn-icon` for delete buttons — red on hover.
```html
<button class="btn-icon btn-icon-del" title="Delete">✕</button>
```

### `.btn-kana`
Kana mode selector button base class.

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

---

## Rules for New Features

1. **Never write inline hover handlers** — use a CSS class instead
2. **Button hierarchy:** primary → ghost → subtle → icon. Pick the lowest weight that works.
3. **Colour meaning is fixed:** teal = correct/active, gold = partial/secondary, red = wrong/danger
4. **New utility classes** go at the bottom of style.css in the utility block (after line 2734)
5. **JS-controlled visibility** (show/hide) stays as inline style — immune to CSS scope issues
6. **Cross-file calls** use `(App.fn || window.fn)?.()`— never bare globals

---

## Do Not Touch

- Status indicator dots — colour IS their meaning
- Recording button gradients — animation states
- Progress bar backgrounds — dynamic values set by JS
- Canvas/waveform drawing colours
- `core-listen.js` solid-fill active states
- `features-stroke.js` cssText elements
