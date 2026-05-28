# Japanese Studio — Design Rules
Last updated: 2026-05-28

## Design Direction
- Dark, minimal, professional — Linear/Notion feel
- Focused desk use — no need for chunky touch targets
- Japanese text is the hero — large, prominent, given space
- Cool blue/slate accent (#5b9bd5) replacing teal (#30d5c8)
- UI chrome recedes, content leads

## Layout Structure (all panels)

### Top bar
- Single horizontal nav bar across the full width
- All main panels listed as tabs with JP label + small EN label below
- Active panel: blue underline (#5b9bd5)
- Stats (streak, due count) pinned to right end

### Sidebar
- Left sidebar present on all panels
- TOP: subtabs for the current panel (Words / Counters / Days etc)
- BOTTOM: ref links — panels used for reference not primary study
  (Progress, Notes, Corpus, Settings)
- Ref links smaller and quieter than subtabs
- Active subtab: blue tint background + blue border

### Main content area
- Drill/content fills the available space
- Card area expands to fill — no fixed heights
- Progress bar at top of content area (2px, subtle)

### Footer layers (pinned to bottom)
Settings stacked from bottom up in order of how rarely they change:

  Layer 1 (bottommost) — FUNDAMENTAL
  The most basic setup: what to study
  e.g. Level (N5/N4/N3), Verb type (う/る/Irregular)

  Layer 2 — CONFIGURATION  
  How to study: filters, forms, combinations
  e.g. Type (Verbs/Nouns), Form (Present/Past/て), Polarity, Register

  Layer 3 — INTRA-DRILL
  Settings that change during a session
  e.g. JP→EN direction, Reading on/off, Pitch on/off, Listen mode

Rule: the more often it changes, the higher it sits.

## Input Controls

### Radio buttons and checkboxes required where possible
- ALWAYS use native radio/checkbox inputs or chip equivalents instead
  of dropdowns when there are 6 or fewer options
- Single selection from a fixed set → radio button style chips
  (only one can be active at a time, clicking another deselects)
- Multi-selection from a fixed set → checkbox style chips
  (any combination can be active)
- Dropdowns only for: large lists (7+ items), variable data
  (deck names, history items), or when space is critically constrained

### Chip appearance
- At rest: faint border, muted text
- Selected: blue border + blue text + very light blue background
- Coloured chips (verb types): use the existing colour coding
  う verbs → green, る verbs → blue, Irregular → gold

### Session size
- Radio chips (10 / 20 / 30 / 50 / All)
- Clicking a size immediately starts a new session — no separate button needed

## Typography
- Japanese display text: large, 2.5–3rem, weight 500
- Prompt/label text: small, muted, recedes
- English translations: medium, rgba(255,255,255,0.5)
- All UI labels: 9–11px, letter-spacing, all caps

## Colours
- Background: #0f0f11
- Surface (sidebar, topbar): #0a0a0c
- Card surface: #141418
- Footer: #0c0c0f
- Accent: #5b9bd5 (cool blue)
- Correct: #00b894 (green)
- Wrong: #c0392b (red)
- Gold (special): #e6a817
- All borders: rgba(255,255,255,0.06–0.12)

## Verb type colours (carry over from current app)
- う verbs: #00b894
- る verbs: #4a9eff
- Irregular: #e6a817

## What not to do
- No dropdown for anything with 6 or fewer fixed options
- No icons on buttons when text is present
- No decorative symbols in button labels (no →, ✕, 🔊 etc)
- No inline styles for anything the design system covers
- No gradients, shadows, or glow effects
- Do not redesign the video panel until a separate decision is made

## Reference panels (sidebar bottom)
These are accessed from any panel for quick reference:
- 進捗 progress
- ノート lesson notes  
- 語彙録 vocab corpus
- ⚙ settings

## Implementation order
1. Vocab drill (visual reference for everything else)
2. Grammar conjugation
3. Kana drill
4. Voice drill
5. Remaining panels
6. Video panel (separate decision needed)
