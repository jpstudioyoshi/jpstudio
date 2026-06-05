// ╔══════════════════════════════════════════════════════════════════════════════
// ║ GrammarPrereqModel.js
// ║ N5 grammar prerequisite graph.
// ║ Models the dependency order of N5 grammar concepts.
// ║ Provides two agent signals:
// ║   agentGrammarRootSignal()   — upstream cause of current errors
// ║   agentGrammarUnlockSignal() — concepts now structurally ready to study
// ║ No UI. Called by features-voice.js (briefing assembly).
// ╚══════════════════════════════════════════════════════════════════════════════

const N5_GRAPH = {
  nodes: [
    { id: "copula",        label: "です",                  requires: [],                          spine: "core"     },
    { id: "word-order",    label: "SOV word order",         requires: [],                          spine: "core"     },
    { id: "topic-wa",      label: "は (topic)",             requires: [],                          spine: "particle" },
    { id: "subject-ga",    label: "が (subject)",           requires: ["topic-wa"],                spine: "particle" },
    { id: "object-wo",     label: "を (object)",            requires: ["verb-concept"],            spine: "particle" },
    { id: "location-ni",   label: "に (location/time)",     requires: ["word-order"],              spine: "particle" },
    { id: "place-de",      label: "で (place/means)",       requires: ["location-ni"],             spine: "particle" },
    { id: "direction-he",  label: "へ (direction)",         requires: ["location-ni"],             spine: "particle" },
    { id: "also-mo",       label: "も (also)",              requires: ["topic-wa"],                spine: "particle" },
    { id: "and-to",        label: "と (and/with)",          requires: [],                          spine: "particle" },
    { id: "possess-no",    label: "の (possession)",        requires: [],                          spine: "particle" },
    { id: "verb-concept",  label: "Verb concept",           requires: [],                          spine: "verb"     },
    { id: "verb-groups",   label: "Verb groups (る/う/irr)", requires: ["verb-concept"],           spine: "verb"     },
    { id: "masu-form",     label: "ます form",              requires: ["verb-groups"],             spine: "verb"     },
    { id: "dict-form",     label: "Dictionary form",        requires: ["verb-groups"],             spine: "verb"     },
    { id: "negative",      label: "Negative (ない/ません)",  requires: ["masu-form","dict-form"],  spine: "verb"     },
    { id: "past",          label: "Past (た/ました)",       requires: ["masu-form","dict-form"],   spine: "verb"     },
    { id: "i-adj",         label: "い-adjectives",          requires: [],                          spine: "adj"      },
    { id: "na-adj",        label: "な-adjectives",          requires: ["copula"],                  spine: "adj"      },
    { id: "adj-inflect",   label: "Adjective past/neg",     requires: ["i-adj","na-adj"],          spine: "adj"      },
    { id: "te-form",       label: "て-form",                requires: ["verb-groups","past"],       spine: "te"       },
    { id: "te-kudasai",    label: "てください",             requires: ["te-form"],                 spine: "te"       },
    { id: "te-mo-ii",      label: "てもいい",               requires: ["te-form"],                 spine: "te"       },
    { id: "te-wa-ike",     label: "てはいけない",           requires: ["te-form"],                 spine: "te"       },
    { id: "te-iru",        label: "ている",                 requires: ["te-form"],                 spine: "te"       },
    { id: "te-kara",       label: "てから",                 requires: ["te-form"],                 spine: "te"       },
    { id: "tai",           label: "たい (want to)",         requires: ["masu-form"],               spine: "modal"    },
    { id: "tsumori",       label: "つもり (intention)",     requires: ["dict-form"],               spine: "modal"    },
    { id: "koto-ga-deki",  label: "ことができる (ability)", requires: ["dict-form"],               spine: "modal"    },
    { id: "kara-because",  label: "から (because)",         requires: ["word-order"],              spine: "link"     },
    { id: "kedo",          label: "けど/が (contrast)",     requires: ["word-order"],              spine: "link"     },
    { id: "soshite",       label: "そして (and then)",      requires: [],                          spine: "link"     },
    { id: "toki",          label: "とき (when)",            requires: ["past","dict-form"],        spine: "clause"   },
    { id: "mae-ato",       label: "前に/後で",              requires: ["dict-form","past"],        spine: "clause"   },
    { id: "nagara",        label: "ながら (while)",         requires: ["masu-form"],               spine: "clause"   },
    { id: "ka",            label: "か (question)",          requires: [],                          spine: "modal"    },
    { id: "ne",            label: "ね (confirmation)",      requires: [],                          spine: "modal"    },
    { id: "yo",            label: "よ (assertion)",         requires: [],                          spine: "modal"    },
    { id: "deshou",        label: "でしょう",               requires: ["copula"],                  spine: "modal"    },
  ],
  errorNodeMap: {
    "conjugation":  ["masu-form", "dict-form", "negative", "past", "te-form"],
    "particle":     ["topic-wa", "subject-ga", "object-wo", "location-ni", "place-de"],
    "word-choice":  ["verb-concept", "dict-form"],
    "spelling":     ["masu-form", "te-form"],
    "word-order":   ["word-order"],
    "formality":    ["masu-form", "copula"],
  },
  masteryNodeMap: {
    "counter_mastered":  ["verb-groups"],
    "conj_present":      ["masu-form", "dict-form"],
    "conj_past":         ["past"],
    "conj_negative":     ["negative"],
    "conj_te":           ["te-form"],
    "conj_volitional":   ["masu-form"],
    "conj_passive":      ["te-form"],
    "conj_potential":    ["dict-form"],
  },
  getNode(id)       { return this.nodes.find(n => n.id === id); },
  getRequires(id)   { return (this.getNode(id)?.requires || []); },
  getDownstream(id) { return this.nodes.filter(n => n.requires.includes(id)); },
};

function agentGrammarRootSignal(writingErrors, grammarErrors) {
  const signals = [];
  const implicatedIds = new Set();
  for (const err of writingErrors) {
    const nodes = N5_GRAPH.errorNodeMap[err.errorType] || [];
    nodes.forEach(id => implicatedIds.add(id));
  }
  for (const err of grammarErrors) {
    if (err.misses >= 2) {
      if (err.form === 'te')         implicatedIds.add('te-form');
      if (err.form === 'past')       implicatedIds.add('past');
      if (err.form === 'present')    implicatedIds.add(err.reg === 'polite' ? 'masu-form' : 'dict-form');
      if (err.form === 'negative')   implicatedIds.add('negative');
      if (err.form === 'potential')  implicatedIds.add('koto-ga-deki');
      if (err.form === 'passive')    implicatedIds.add('te-form');
      if (err.form === 'causative')  implicatedIds.add('te-form');
      if (err.form === 'volitional') implicatedIds.add('tsumori');
    }
  }
  if (implicatedIds.size === 0) return signals;
  for (const id of implicatedIds) {
    const prereqs = N5_GRAPH.getRequires(id);
    const weakPrereqs = prereqs.filter(p => implicatedIds.has(p));
    if (weakPrereqs.length > 0) {
      const node  = N5_GRAPH.getNode(id);
      const roots = weakPrereqs.map(p => N5_GRAPH.getNode(p)?.label || p).join(', ');
      signals.push({
        type: 'grammar_root', priority: 3,
        label: 'Errors in ' + node.label + ' may root in: ' + roots + ' — reinforcing the prerequisite may resolve the downstream pattern',
        actionFn: 'openGramNote(\'syntax\',\'Prerequisite: ' + roots.replace(/'/g,"\\'") + '\')', actionLabel: 'Note',
      });
    }
  }
  return signals.slice(0, 1);
}

function agentGrammarUnlockSignal(grammarErrors, conjSessionData) {
  const signals = [];
  const satisfied = new Set();
  ['copula','word-order','topic-wa','verb-concept','i-adj','and-to','possess-no',
   'ka','ne','yo','soshite'].forEach(id => satisfied.add(id));
  const drilledForms = new Set(grammarErrors.map(e => e.form));
  if (drilledForms.has('present'))   { satisfied.add('masu-form'); satisfied.add('dict-form'); satisfied.add('verb-groups'); }
  if (drilledForms.has('past'))      { satisfied.add('past'); }
  if (drilledForms.has('negative'))  { satisfied.add('negative'); }
  if (drilledForms.has('te'))        { satisfied.add('te-form'); }
  if (conjSessionData)               { satisfied.add('verb-groups'); satisfied.add('masu-form'); satisfied.add('dict-form'); }
  const candidates = N5_GRAPH.nodes.filter(n => {
    if (satisfied.has(n.id)) return false;
    if (n.requires.length === 0) return false;
    return n.requires.every(r => satisfied.has(r));
  });
  if (candidates.length > 0) {
    candidates.sort((a,b) => (b.spine === 'te' ? 1 : 0) - (a.spine === 'te' ? 1 : 0));
    const picks = candidates.slice(0, 2).map(n => n.label).join(' and ');
    signals.push({
      type: 'grammar_unlock', priority: 2,
      label: 'Based on your verb form practice you are structurally ready to explore: ' + picks,
      actionFn: 'openGramNote(\'syntax\',\'Ready to explore: ' + picks.replace(/'/g,"\\'") + '\')', actionLabel: 'Note',
    });
  }
  return signals;
}
