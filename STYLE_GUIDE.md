# Japanese Studio — Style Guide
Last updated: 2026-05-25

Single reference for all visual tokens, button classes, and state utilities.
When adding any interactive element, use classes from this file — do not write inline styles for colors, borders, or state.

---

## Design Tokens (CSS Variables)

All defined in `:root` in `style.css`. Dark theme only (light theme not yet implemented).

### Color — Text
| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#f5f5f7` | Primary text |
| `--ink-light` | `#c0c0c5` | Secondary text, labels, hints |

### Color — Surface
| Token | Value | Use |
|-------|-------|-----|
| `--paper` | `#1c1c1e` | Main background |
| `--paper-dark` | `#3d3d40` | Slightly elevated surface, row hover target |
| `--paper-mid` | `#4e4e52` | Mid-level surface, icon buttons |
| `--panel` | `#2c2c2e` | Sidebar, panel backgrounds |
| `--field` | `#111113` | Input backgrounds |

### Color — Brand / State
| Token | Value | Use |
|-------|-------|-----|
| `--teal` | `#30d5c8` | Primary action, active states, correct |
| `--teal-light` | `#5ee7d0` | Lighter teal accent |
| `--gold` | `#ffd60a` | Warning, partial, secondary active |
| `--gold-light` | `#ffe545` | Lighter gold accent |
| `--red` | `#ff6b6b` | Error, wrong, destructive, recording |
| `--red-light` | `#ff8585` | Lighter red accent |
| `--sage` | `#7ed886` | Positive/success (rare use) |

### Color — Borders
| Token | Value | Use |
|-------|-------|-----|
| `--border` | `rgba(255,255,255,0.22)` | Default borders |
| `--field-border` | `rgba(255,255,255,0.28)` | Input borders |
| `--field-focus` | `#30d5c8` | Input focus ring (= teal) |

### Typography
| Token | Use |
|-------|-----|
| `--ui` | `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif` — all UI text |
| `--jp` | `'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif` — Japanese text |
| `--serif` | `Georgia, 'Times New Roman', serif` — reading/literary content |

---

## Button Classes

### `.btn-primary`
Teal filled CTA. Use for the main action in a panel.
```html
<button class="btn-primary" onclick="doThing()">Start →</button>
```
- Hover: opacity 0.85
- Disabled: opacity 0.4

### `.btn-ghost`
Bordered secondary button. Use for most interactive buttons.
```html
<button class="btn-ghost" onclick="doThing()">Export</button>
```
- Hover: border and text go to `--ink`
- Disabled: opacity 0.4
- Note: `.btn-ghost:hover` already handles hover — do NOT add `onmouseover` handlers

### `.btn-danger`
Red bordered button for destructive actions.
```html
<button class="btn-danger" onclick="deleteItem()">Delete</button>
```

### `.btn-subtle`
Borderless, small, ink-light text. Use for secondary utility actions (e.g. "↺ New drill", "🖼 Objects").
```html
<button class="btn-subtle" onclick="reset()">↺ New drill</button>
```
- Hover: text goes to `--ink`
- Font size: 0.72rem

### `.btn-icon`
Borderless icon/emoji button. Use for inline icon actions.
```html
<button class="btn-icon" onclick="doThing()">✎</button>
```
- Hover: opacity 1 (from 0.85)

### `.btn-kana`
Kana mode selector buttons (A / ひ / カ). Used across all 10 kana inputs. Do not use for other purposes.

---

## State Utility Classes

Apply these via `classList.add/remove/toggle` — never via inline `style.color` etc.

### Active / Selected States

| Class | Visual | Use |
|-------|--------|-----|
| `.btn-active` | Teal border + bg | Button group active item (teal) |
| `.btn-active-gold` | Gold border + bg | Button group active item (gold) |
| `.btn-active-red` | Red border + bg | Wrong answer button, error state |
| `.toggle-on` | Teal border + bg (lighter) | On/off toggle in ON state |

**Button group pattern:**
```js
// setButtonGroupActive() handles this — use it
setButtonGroupActive(containerId, activeId);

// Manual pattern if needed:
btns.forEach(b => b.classList.remove('btn-active'));
activeBtn.classList.add('btn-active');
```

**Toggle pattern:**
```js
btn.classList.toggle('toggle-on', isActive);
```

### Result / Feedback Colors

| Class | Color | Use |
|-------|-------|-----|
| `.result-correct` | `--teal` | Correct answer text |
| `.result-wrong` | `--red` | Wrong answer text |
| `.result-partial` | `--gold` | Partial/close answer text |

```js
// Pattern — always remove the others when adding one:
el.classList.add('result-correct');
el.classList.remove('result-wrong', 'result-partial');

// Or use toggle with condition:
el.classList.toggle('result-correct', score >= 0.85);
```

### Input States

| Class | Visual | Use |
|-------|--------|-----|
| `.input-correct` | Teal border | Input field correct state |
| `.input-error` | Red border | Input field error/wrong state |

Both use `!important` to override default field border.

### Row Hover

| Class | Visual | Use |
|-------|--------|-----|
| `.row-hover` | `--paper-dark` bg on hover | Standard list rows |
| `.row-hover-teal` | Teal-tinted bg on hover | Conversation left column |
| `.row-hover-gold` | Gold-tinted bg on hover | Conversation right column |

```js
// Add once when building the row — CSS handles the rest
row.classList.add('row-hover');
```

### Loading / Disabled

| Class | Visual | Use |
|-------|--------|-----|
| `.loading` | opacity 0.6, no pointer events | Generic loading state |
| `.kanji-btn.loading` | opacity 0.5, no pointer events | Kanji fetch in progress |
| `.vt-furi-btn.loading` | gold pulse animation | Furigana fetch in progress |

---

## Component-Specific Active Rules

These exist in `style.css` for components with unique active visual needs. They follow `.componentname.active` pattern and are set via `classList.add('active')`.

**Display toggles (show/hide panels):**
- `.panel.active` — `display: block`
- `.yoshi-subpanel.active` — `display: block`
- `.gramnote-section.active` — `display: block`
- `.gramnote-section.active` — `display: block`

**Teal outline active (same as toggle-on but component-scoped):**
- `.mode-btn.active`
- `.yoshi-session-item.active`
- `.yoshi-subtab.active`
- `.yoshi-read-btn.active`
- `.yoshi-loop-btn.active`
- `.topic-chip.active`
- `.listen-speed-btn.active`
- `.ctr-tab.active`
- `.ctr-group-btn.active`
- `.listen-mode-toggle.active`
- `.te-group-btn.active`

**Ink-filled tabs (inverted — ink bg, paper text):**
- `.gramnote-tab.active`
- `.vc-filter-btn.active`
- `.vc-sort-btn.active`

**Special:**
- `.trans-dir-btn.active` — red underline
- `.trans-breakdown-tab.active` — teal underline
- `.vt-cue.active` — teal left border + bg highlight
- `.listen-track.active` — paper-mid bg
- `.vg-card.active` — elevated card state
- `#dictModeBtn.active` — solid teal fill (panel-open state)

---

## What NOT to Do

```js
// ❌ Never set state via inline style
btn.style.color = 'var(--teal)';
btn.style.borderColor = 'var(--teal)';
btn.style.background = 'rgba(48,213,200,0.08)';

// ✅ Use utility class
btn.classList.add('toggle-on');

// ❌ Never add onmouseover/onmouseout for colors that CSS handles
<button onmouseover="this.style.color='var(--teal)'" ...>

// ✅ Let CSS :hover do it, or add a class with :hover rule

// ❌ Never hardcode rgba teal/red/gold literals
el.style.background = 'rgba(48,213,200,0.12)';

// ✅ Use a class that references the CSS variable
el.classList.add('btn-active');
```

## Legitimate Inline Styles

These are intentional and should stay as inline styles:

- `style.display` — JS-controlled visibility (immune to scope issues)
- `style.width` on progress bars — dynamic percentage values
- `style.background` on status dots — the color IS the content
- `style.background` on recording buttons — gradient animation states
- `cssText` on dynamically constructed canvas/waveform elements
- Layout values (flex, padding, gap, width, height) on generated elements

---

## Remaining Debt (known, not yet fixed)

- ~12 `onmouseover/onmouseout` handlers inside JS template literals
- ~980 inline `style=` attributes in `index.html` (layout + color mixed)
- `--panel` defined twice in `:root` (duplicate, harmless)
- `.btn-ghost:hover` goes to `--ink` not `--teal` — inconsistent with most hover patterns
- Component `.active` rules could consolidate into `.toggle-on` over time
