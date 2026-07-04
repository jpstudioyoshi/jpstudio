#!/usr/bin/env node
// Scrapes St. Olaf Genki II grammar pages and writes grammar_nodes_g2.json
// Run from jpStudio root: node scrape-grammar-g2.js
// Output: src/data/grammar_nodes_g2.json (ready to merge into grammar_nodes.json later)

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_PATH = path.join(__dirname, 'src/data/grammar_nodes_g2.json');
const BASE = 'https://wp.stolaf.edu/japanese/grammar-index/genki-i-ii-grammar-index/';

// Genki II nodes — chapters 13–23
const G2_NODES = [
  { id: 'potential_verbs',        label: 'Potential verbs',                     genki: 13, slug: 'potential-verbs-genki-ii-chapter-13' },
  { id: 'nara',                   label: 'なら conditional',                     genki: 13, slug: 'nara-genki-ii-chapter-13' },
  { id: 'so_desu_looks',          label: '〜そうです (looks like)',               genki: 13, slug: 'so-desu-looks-like-genki-ii-chapter-13' },
  { id: 'shi',                    label: '〜し (listing reasons)',               genki: 13, slug: 'shi-genki-ii-chapter-13' },
  { id: 'temiru',                 label: '〜てみる (try doing)',                  genki: 13, slug: 'temiru-genki-ii-chapter-13' },
  { id: 'ageru_kureru_morau',     label: 'あげる／くれる／もらう',               genki: 14, slug: 'ageru-kureru-morau-genki-ii-chapter-14' },
  { id: 'hoshii',                 label: '〜ほしい (want someone to)',            genki: 14, slug: 'hoshi-genki-ii-chapter-14' },
  { id: 'kamoshiremasen',         label: '〜かもしれません (maybe)',              genki: 14, slug: 'kamoshiremasen-genki-ii-chapter-14' },
  { id: 'tara_dodesuka',          label: '〜たらどうですか (why don\'t you)',    genki: 14, slug: 'tara-dodesuka-genki-ii-chapter-14' },
  { id: 'number_mo_shika',        label: 'Number+も／しか+neg',                  genki: 14, slug: 'number-mo-number-shika-negative-genki-ii-chapter-14' },
  { id: 'volitional',             label: 'Volitional form (〜よう)',              genki: 15, slug: 'volitional-form-genki-ii-chapter-15' },
  { id: 'teoku',                  label: '〜ておく (do in advance)',              genki: 15, slug: 'teoku-genki-ii-chapter-15' },
  { id: 'using_sentences_nouns',  label: 'Using sentences to qualify nouns',     genki: 15, slug: 'using-sentences-to-qualify-nouns-genki-ii-chapter-15' },
  { id: 'toii',                   label: '〜といい (I hope/it would be good)',    genki: 16, slug: 'toii-genki-ii-chapter-16' },
  { id: 'toki',                   label: '〜とき (when)',                         genki: 16, slug: 'toki-genki-ii-chapter-16' },
  { id: 'tekureru_ageru_morau',   label: '〜てくれる／あげる／もらう',            genki: 16, slug: 'tekureruagerumorau-genki-ii-chapter-16' },
  { id: 'teitadakemasen',         label: '〜ていただけませんか (request)',         genki: 16, slug: 'teitadakemasen-genki-ii-chapter-16' },
  { id: 'te_sumimasen',           label: '〜てすみませんでした (apology)',         genki: 16, slug: 'te-sumimasen-deshita-genki-ii-chapter-16' },
  { id: 'tara',                   label: '〜たら (if/when)',                      genki: 17, slug: 'tara-genki-ii-chapter-17' },
  { id: 'tara_nakutemo',          label: '〜なくてもいいです',                    genki: 17, slug: 'nakutemoiidesu-genki-ii-chapter-17' },
  { id: 'so_desu_hear',           label: '〜そうです (I hear)',                   genki: 17, slug: 'so-desu-i-hear-genki-ii-chapter-17' },
  { id: 'mitai',                  label: '〜みたいです (looks like)',              genki: 17, slug: 'mitaidesu-genki-ii-chapter-17' },
  { id: 'maeni_tekara',           label: '〜前に／〜てから',                      genki: 17, slug: 'maeni-tekara-genki-ii-chapter-17' },
  { id: 'teshimau',               label: '〜てしまう (end up doing)',             genki: 18, slug: 'teshimau-genki-ii-chapter-18' },
  { id: 'to_conditional',         label: '〜と (if/when, natural result)',        genki: 18, slug: 'to-genki-ii-chapter-18' },
  { id: 'nagara',                 label: '〜ながら (while doing)',                genki: 18, slug: 'nagara-genki-ii-chapter-18' },
  { id: 'bayokatta',              label: '〜ばよかった (should have)',             genki: 18, slug: 'bayokatta-desu-genki-ii-chapter-18' },
  { id: 'transitive_pairs',       label: 'Transitive/intransitive pairs',         genki: 18, slug: 'transitive-pairs-genki-ii-chapter-18' },
  { id: 'honorific_verbs',        label: 'Honorific verbs (keigo)',               genki: 19, slug: 'honorific-verbs-keigo-genki-ii-chapter-19' },
  { id: 'hazudesu',               label: '〜はずです (supposed to)',              genki: 19, slug: 'hazudesu-genki-ii-chapter-19' },
  { id: 'teyokatta',              label: '〜てよかった (glad that)',               genki: 19, slug: 'teyokattadesu-genki-ii-chapter-19' },
  { id: 'kurete_arigato',         label: '〜てくれてありがとう',                  genki: 19, slug: 'kuretearigato-genki-ii-chapter-19' },
  { id: 'respectful_advice',      label: 'Giving respectful advice',              genki: 19, slug: 'giving-respectful-advice-genki-ii-chapter-19' },
  { id: 'extra_modest',           label: 'Extra modest expressions',              genki: 20, slug: 'extra-modest-expressions-genki-ii-chapter-20' },
  { id: 'humble_expressions',     label: 'Humble expressions',                    genki: 20, slug: 'humble-expressions-genki-ii-chapter-20' },
  { id: 'questions_in_sentences', label: 'Questions within larger sentences',     genki: 20, slug: 'questions-within-larger-sentences-genki-ii-chapter-20' },
  { id: 'name_toiu',              label: '〜という (called/named)',               genki: 20, slug: 'name-toiu-item-genki-ii-chapter-20' },
  { id: 'naide',                  label: '〜ないで (without doing)',               genki: 20, slug: 'naide-genki-ii-chapter-20' },
  { id: 'yasui_nikui',            label: '〜やすい／にくい',                      genki: 20, slug: 'yasui-nikui-genki-ii-chapter-20' },
  { id: 'passive',                label: 'Passive sentences',                     genki: 21, slug: 'passive-sentences-genki-ii-chapter-21' },
  { id: 'tearu',                  label: '〜てある (resultant state)',             genki: 21, slug: 'tearu-genki-ii-chapter-21' },
  { id: 'tehoshii',               label: '〜てほしい (want someone to)',           genki: 21, slug: 'tehoshi-genki-ii-chapter-21' },
  { id: 'noni',                   label: '〜のに (even though)',                  genki: 21, slug: 'noni-genki-ii-chapter-21' },
  { id: 'adjective_suru',         label: 'Adjective + する',                      genki: 21, slug: 'adjective-suru-genki-ii-chapter-21' },
  { id: 'causative',              label: 'Causative sentences',                   genki: 22, slug: 'causative-sentences-genki-ii-chapter-22' },
  { id: 'ba_conditional',         label: '〜ば conditional',                      genki: 22, slug: 'ba-genki-ii-chapter-22' },
  { id: 'noyona_noyoni',          label: '〜ような／ように',                      genki: 22, slug: 'noyona-noyoni-genki-ii-chapter-22' },
  { id: 'nasai',                  label: 'Verb stem + なさい (command)',           genki: 22, slug: 'verb-stem-nasai-genki-ii-chapter-22' },
  { id: 'causative_passive',      label: 'Causative-passive sentences',           genki: 23, slug: 'causative-passive-sentences-genki-ii-chapter-23' },
  { id: 'kata',                   label: '〜方 (way of doing)',                   genki: 23, slug: 'kara-explanation-within-sentence-genki-i-chapter-9-2' },
  { id: 'temo',                   label: '〜ても (even if)',                      genki: 23, slug: 'temo-genki-ii-chapter-23' },
  { id: 'kotonisuru',             label: '〜ことにする (decide to)',               genki: 23, slug: 'kotonisuru-genki-ii-chapter-23' },
  { id: 'mare',                   label: '〜まれ (passive of birth)',              genki: 23, slug: 'mare-genki-ii-chapter-23' },
];

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
  // lastIndexOf: page has a duplicate mobile-nav copy of the contact widget
  // earlier in raw HTML; first match pulls in nav junk. See scrape-grammar.js.
  const startMarker = 'brookl@stolaf.edu';
  const startIdx = html.lastIndexOf(startMarker);
  if (startIdx === -1) return null;
  const afterContact = html.slice(startIdx + startMarker.length);

  const stopAt = afterContact.search(/St\. Olaf College|<footer|class="site-footer/);
  const contentHtml = stopAt > 0 ? afterContact.slice(0, stopAt) : afterContact.slice(0, 3000);

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

  const emailClean = clean.replace(/^[^a-zA-Zあ-ん一-鿯\n]*brookl@stolaf\.edu\s*/, '');
  return emailClean.slice(0, 2000);
}

async function main() {
  const nodes = [];
  const cache = {};

  for (const node of G2_NODES) {
    const url = BASE + node.slug + '/';
    node.url = url;
    node.group = 'functional';
    node.prerequisites = [];
    node.evidence = ['writing', 'speaking'];

    if (cache[node.slug]) {
      node.notes = cache[node.slug];
      console.log(`✓ cached  ${node.id}`);
      nodes.push(node);
      continue;
    }

    try {
      await new Promise(r => setTimeout(r, 300));
      const html = await fetchPage(url);
      const notes = extractContent(html);
      if (notes && notes.length > 20) {
        node.notes = notes;
        cache[node.slug] = notes;
        console.log(`✓ fetched ${node.id}`);
      } else {
        console.log(`⚠️  empty  ${node.id}`);
      }
    } catch (e) {
      console.log(`✗ failed  ${node.id}: ${e.message}`);
    }
    nodes.push(node);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(nodes, null, 2));
  console.log(`\nDone. Written to ${OUT_PATH}`);
}

main();
