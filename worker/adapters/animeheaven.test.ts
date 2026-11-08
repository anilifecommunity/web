import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baseSeriesTitle,
  decodeEntities,
  parseEpisodes,
  parseSearch,
  parseVideoUrls,
  seasonHint,
  seasonNumber,
  stripTags,
  titleScore,
} from './animeheaven';

const SEARCH = `
<div class='similarimg'>
  <a href='anime.php?abc123'><img src='cover.jpg' alt='Solo Leveling'></a>
  <div class='similarname'><a href='anime.php?abc123'>Solo Leveling</a></div>
</div>
<div class='similarimg'>
  <a href='anime.php?def456'><img src='cover2.jpg' alt='Solo Leveling: Arise'></a>
  <div class='similarname'><a href='anime.php?def456'>Solo Leveling: Arise from the Shadow</a></div>
</div>
`;

const EPISODES = `
<a onclick='gatea("aaa111")'><div class='watch2 bc'>1</div></a>
<a onclick='gatea("bbb222")'><div class='watch2 bc'>2</div></a>
<a onclick='gatea("ccc333")'><div class='watch2 bc'>12</div></a>
`;

const GATE = `
<!--<source src='https://ax.animeheaven.me/video.mp4?decoyhash&x' type='video/mp4'>-->
<source src='https://rt.animeheaven.me/video.mp4?aaa111&x' type='video/mp4'>
<source src='https://ct.animeheaven.me/video.mp4?aaa111&x&error' type='video/mp4'>
<source src='https://ck.animeheaven.me/video.mp4?aaa111&x&error2' type='video/mp4'>
`;

test('parses search cards and keeps the card caption', () => {
  const results = parseSearch(SEARCH);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { path: 'anime.php?abc123', title: 'Solo Leveling' });
  assert.equal(results[1].title, 'Solo Leveling: Arise from the Shadow');
});

test('parses episode numbers and gate keys in order', () => {
  const episodes = parseEpisodes(EPISODES);
  assert.deepEqual(episodes, [
    { number: 1, gateKey: 'aaa111' },
    { number: 2, gateKey: 'bbb222' },
    { number: 12, gateKey: 'ccc333' },
  ]);
});

test('drops the commented decoy source and keeps only the gate-keyed mirrors', () => {
  const urls = parseVideoUrls(GATE, 'aaa111');
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => url.includes('aaa111')));
  assert.ok(urls.every((url) => !url.includes('decoyhash')));
});

test('an unknown gate key yields no mirrors rather than the decoy', () => {
  assert.deepEqual(parseVideoUrls(GATE, 'zzz'), []);
});

test('season-stripped titles and hints line up', () => {
  assert.equal(baseSeriesTitle('Saga of Tanya the Evil Season 2'), 'Saga of Tanya the Evil');
  assert.equal(seasonHint(['Solo Leveling Season 2']), 2);
  assert.equal(seasonHint(['Solo Leveling']), null);
  assert.equal(seasonNumber('Solo Leveling II'), 2);
  assert.equal(seasonNumber('Solo Leveling Season 3'), 3);
});

test('title scoring prefers the right series over a spin-off', () => {
  const exact = titleScore('Solo Leveling', 'Solo Leveling');
  const spinOff = titleScore('Solo Leveling', 'Solo Leveling: Arise from the Shadow');
  const unrelated = titleScore('Solo Leveling', 'Frieren Beyond Journeys End');
  assert.equal(exact, 1);
  assert.ok(spinOff > unrelated);
  assert.ok(unrelated < 0.45);
});

test('strips tags and decodes entities from captions', () => {
  assert.equal(stripTags('<b>Frieren</b> &#039;Beyond&#039;'), "Frieren 'Beyond'");
  assert.equal(decodeEntities('A &amp; B &quot;C&quot;'), 'A & B "C"');
});
