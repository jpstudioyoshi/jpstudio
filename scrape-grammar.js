#!/usr/bin/env node
// Scrapes St. Olaf grammar pages and adds "notes" + "url" fields to grammar_nodes.json
// Run from jpStudio root: node scrape-grammar.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const NODES_PATH = path.join(__dirname, 'src/data/grammar_nodes.json');

// Manual mapping: node id → St. Olaf URL slug
const URL_MAP = {
  desu:                  'desu-genki-i-chapter-1',
  question_ka:           'question-sentences-genki-i-chapter-1',
  particle_no_possession:'no-with-nouns-genki-i-chapter-1',
  word_order:            'word-order-genki-i-chapter-3',
  kore_sore_are:         'kore-sore-are-dore-genki-i-chapter-2',
  koko_soko_asoko:       'koko-soko-asoko-doko-genki-i-chapter-2',
  particle_mo:           'particle-mo-genki-i-chapter-4',
  noun_ja_arimasen:      'noun-ja-arimasen-genki-i-chapter-2',
  particles_ne_yo:       'particles-ne-yo-genki-i-chapter-2',
  particle_wa:           'particle-wa-genki-i-chapter-3',
  present_tense_masu:    'present-tense-genki-i-chapter-3',
  verb_groups:           'basic-verb-conjugation-genki-i-chapter-3',
  particle_wo:           'particles-genki-i-chapter-3',
  particle_ni_time:      'time-reference-genki-i-chapter-3',
  particle_de_place:     'particle-de-genki-i-chapter-10',
  particle_he:           'particles-genki-i-chapter-3',
  time_reference:        'time-reference-genki-i-chapter-3',
  frequency_adverbs:     'frequency-adverbs-genki-i-chapter-3',
  past_tense_masu:       'past-tense-genki-i-chapter-4',
  aru_iru:               'aru-iru-genki-i-chapter-4',
  location_words:        'location-words-genki-i-chapter-4',
  particle_to:           'particle-to-genki-i-chapter-4',
  duration_of_time:      'duration-of-time-genki-i-chapter-4',
  i_adjective:           'adjectives-genki-i-chapter-5',
  na_adjective:          'adjectives-genki-i-chapter-5',
  suki_kirai:            'suki-kirai-genki-i-chapter-5',
  counting:              'counting-genki-i-chapter-5',
  masho:                 'masho-genki-i-chapter-5',
  te_form:               'te-form-genki-i-chapter-6',
  te_kudasai:            'tekudasai-genki-i-chapter-6',
  te_mo_ii:              'temoiidesu-tewaikemasen-genki-i-chapter-6',
  te_wa_ikemasen:        'temoiidesu-tewaikemasen-genki-i-chapter-6',
  kara_reason:           'kara-genki-i-chapter-6',
  te_iru:                'teiru-genki-i-chapter-7',
  te_form_joining:       'te-form-joining-sentences-genki-i-chapter-7',
  ni_iku:                'ni-iku-genki-i-chapter-7',
  short_forms_plain:     'short-forms-genki-i-chapter-8',
  particle_ga:           'particle-ga-genki-i-chapter-8',
  nai_de_kudasai:        'nai-de-kudasai-genki-i-chapter-8',
  verbs_as_nouns:        'verbs-as-nouns-genki-i-chapter-8',
  short_form_past:       'short-form-past-genki-i-chapter-9',
  qualifying_nouns:      'qualifying-nouns-with-verbs-and-adjectives-genki-i-chapter-9',
  kara_explanation:      'kara-explanation-within-sentence-genki-i-chapter-9',
  mada_te_imasen:        'mada-te-imasen-genki-i-chapter-9',
  tsumori:               'tsumorida-genki-i-chapter-10',
  comparison:            'comparison-genki-i-chapter-10',
  naru:                  'naru-to-become-genki-i-chapter-10',
  tai:                   'tai-genki-i-chapter-11',
  tari_tari_suru:        'tari-tarisuru-genki-i-chapter-11',
  koto_ga_aru:           'kotoga-aru-genki-i-chapter-11',
  n_desu:                'n-desu-genki-i-chapter-12',
  ho_ga_ii:              'ho-ga-ii-desu-genki-i-chapter-12',
  nakucha_ikemasen:      'nakucha-ikemasen-genki-i-chapter-12',
  node_because:          'node-genki-i-chapter-12',
  desho:                 'desho-genki-i-chapter-12',
};

const BASE = 'https://wp.stolaf.edu/japanese/ressource-projects/genki-i-ii-grammar-index/';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function extractContent(html) {
  // Start after the contact email block, stop before footer
  const startMarker = 'brookl@stolaf.edu';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return null;
  const afterContact = html.slice(startIdx + startMarker.length);

  // Stop at footer
  const stopAt = afterContact.search(/St\. Olaf College|<footer|class="site-footer/);
  const contentHtml = stopAt > 0 ? afterContact.slice(0, stopAt) : afterContact.slice(0, 3000);

  // Keep only safe formatting tags, strip the rest
  const clean = contentHtml
    .replace(/<(p|br|strong|b|em|li|ul|ol)(\s[^>]*)?>|<\/(p|strong|b|em|li|ul|ol)>/gi, (m) => {
      if (/^<p/i.test(m) || /^<br/i.test(m) || /^<\/p/i.test(m)) return '\n';
      if (/^<strong|^<b/i.test(m)) return '<strong>';
      if (/^<\/strong|^<\/b/i.test(m)) return '</strong>';
      if (/^<li/i.test(m)) return '\n• ';
      return '';
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strip anything before and including the email marker residue
  const emailClean = clean.replace(/^[^a-zA-Zあ-ん一-龯\n]*brookl@stolaf\.edu\s*/,'');
  return emailClean.slice(0, 1200); // cap at 1200 chars
}

async function main() {
  const nodes = JSON.parse(fs.readFileSync(NODES_PATH, 'utf8'));
  let fetched = 0, skipped = 0;

  // Cache fetched URLs to avoid duplicate fetches
  const cache = {};

  for (const node of nodes) {
    const slug = URL_MAP[node.id];
    if (!slug) {
      console.log(`⚠️  No URL mapping for: ${node.id}`);
      skipped++;
      continue;
    }

    const url = BASE + slug + '/';
    node.url = url;

    if (cache[slug]) {
      node.notes = cache[slug];
      console.log(`✓ cached  ${node.id}`);
      fetched++;
      continue;
    }

    try {
      await new Promise(r => setTimeout(r, 300)); // polite delay
      const html = await fetchPage(url);
      const notes = extractContent(html);
      if (notes && notes.length > 20) {
        node.notes = notes;
        cache[slug] = notes;
        console.log(`✓ fetched ${node.id}`);
      } else {
        console.log(`⚠️  empty  ${node.id}`);
      }
      fetched++;
    } catch (e) {
      console.log(`✗ failed  ${node.id}: ${e.message}`);
      skipped++;
    }
  }

  fs.writeFileSync(NODES_PATH, JSON.stringify(nodes, null, 2));
  console.log(`\nDone. ${fetched} fetched, ${skipped} skipped.`);
  console.log(`Written to ${NODES_PATH}`);
}

main();
