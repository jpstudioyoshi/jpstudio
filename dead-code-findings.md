# Dead Code Findings — 2026-06-11

Generated from audit-2026-06-11.md + direct extraction of all `function name(` definitions
in src/**/*.js and main.js (1118 functions). Call sites checked across src, main.js,
preload*.js, management-*.js, and all HTML files, including:
- `(App.X || window.X)()` wrapper calls
- `onclick="..."` strings (static HTML and JS-generated template literals)
- callback references (addEventListener, setTimeout, property assignment)

**No deletions made. Findings only.**

Confidence:
- **certain** — zero references anywhere outside the definition
- **likely** — referenced only in App registry / window[] export lines; could in theory
  be called dynamically via `window[name]` or `App[name]` with a computed name

## Findings by file

### src/core-srs.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| isVoiced | 274 | certain | zero references anywhere |

### src/core-vocab.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| vcFetch | 628 | likely | window export at features-tools.js:367, but no button or call anywhere. If confirmed dead, vcFetchSelectAll (688) and vcFetchAdd are transitively dead — their only call sites are in HTML that vcFetch itself generates |

### src/features-core.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| ctrToggle | 229 | likely | window export only; not to be confused with ctrToggleDrill, which is alive |

### src/features-reading.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| vgToggleMic | 452 | likely | window export only |

### src/features-voice-drill.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| customToggleRecord | 473 | likely | App registry only |

### src/features-lesson-notes.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| lnLoadTimeline | 710 | certain | zero references anywhere |
| lnCreateFromPaste | 2763 | likely | App registry only; comment at line 3254 says "moved" — looks like an orphaned migration |
| lnDeleteRecording | 3216 | likely | App registry only |

### src/features-tools.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| yoshiSaveWhatsappInline | 9 | likely | App registry only |
| yoshiRetranscribe | 23 | likely | App registry only |

### src/features-voice.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| rtStartRound2 | 1698 | certain | trigger buttons (rtRound2Btn, rtCompareBtn) don't exist in index.html or any generated markup; the show/hide code for them is a no-op |
| rtCompare | 1772 | certain | same orphaned-button situation |
| voiceSendText | 2812 | likely | App registry only; comment at line 1191 describing its role is stale |
| voiceUploadAudio | 2845 | certain | zero references anywhere |

### src/Orchestrator.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| getCurrentSession | 250 | likely | in module export object, but .getCurrentSession( never called |
| yoshiStartRecording | 276 | likely | explicit back-compat shim, registry only |
| yoshiStopRecording | 284 | likely | same |
| yoshiLoadLessonSessions | 288 | likely | same |
| yoshiDeleteLessonSession | 292 | likely | same |
| yoshiTranscribeCurrent | 301 | likely | same |

### src/ui/TextEntry.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| val | 213 | likely | exported in TextEntry API object; no .val( call found |

### src/ui/YoshiUI.js
| Function | Line | Confidence | Notes |
|---|---|---|---|
| _onRecord | 105 | certain | wireButtons() is now an explicit no-op ("record/stop buttons removed from main panel"), so these handlers are never attached |
| _onStop | 110 | certain | same |

**Totals: 8 certain, 14 likely.**

## False positives excluded (alive)

- `vocabSettingsSave`, `renderStrandMini`, `weightsSave`, `weightsReset`, `qrLoadText`,
  `cdTabInit`, `gramSentPracticePattern` — called via the `(App.X||window.X)()` wrapper
- `wireEpubInputs`, `injectConjBadgeCSS` — named self-executing IIFEs
- `startVoice` (TextEntry) — called via `(App.TextEntry||window.TextEntry).startVoice(...)` in generated onclick
- `seekOnce`, `dismiss`, `handler`, `docGuard`, `onKeydown`, `onDocClick`, `toggleSide`,
  `epubOnWordSelect` — named event-handler function expressions
- `lnParseSentenceFurigana` — called via setTimeout

## Open question

The rt* cluster (rtStartRound2, rtCompare) lines up with the pending "FLUENCY_432 emitter"
item in context-session.md — it looks half-wired rather than abandoned. Worth a deliberate
keep/delete decision rather than an automatic sweep.
