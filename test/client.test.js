import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKS,
  decodePayload,
  encodePayload,
  FfhbClient,
  FfhbError,
  keyFromPage,
} from '../src/ffhandball/client.js';
import { COMPETITION_URL, createFakeFfhb, KEY, TEAM_URL } from './helpers/fakeFfhb.js';
import { parseCompetitionUrl, parseTeamUrl } from '../src/config.js';

test('an answer decodes the way the site decodes it, accents included', () => {
  const data = { libelle: 'CHAMBÉRY SAVOIE', score: '29', date: null };
  const payload = encodePayload(data, KEY);
  // base64 of the XORed bytes, as the site answers: no plain text left.
  assert.match(payload, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(!Buffer.from(payload, 'base64').toString('latin1').includes('libelle'));
  assert.deepEqual(decodePayload(payload, KEY), data);
});

test('the key is read from the body of a page', () => {
  assert.equal(keyFromPage('<body class="home" data-cfk="abc123">'), 'abc123');
  assert.equal(keyFromPage('<body>'), null);
});

test('the key is read once, then every block decodes with it', async () => {
  const site = createFakeFfhb();
  const client = new FfhbClient({ fetch: site.fetch });
  const ref = parseTeamUrl(TEAM_URL);
  const blocks = await client.fetchTeam(ref);
  assert.equal(blocks.pool.selected_equipe.libelle, 'HBC TEST');
  assert.equal(blocks.matches.rencontres.length, 4);
  assert.equal(blocks.standings.classements.length, 4);
  assert.equal(site.calls.filter((call) => call === '/competitions/').length, 1);
  await client.fetchTeam(ref);
  assert.equal(site.calls.filter((call) => call === '/competitions/').length, 1);
});

test('a key the site rotated is read again, once', async () => {
  const site = createFakeFfhb();
  const client = new FfhbClient({ fetch: site.fetch });
  const ref = parseTeamUrl(TEAM_URL);
  await client.fetchTeam(ref);
  site.key = 'aNewKeyFromTheSite';
  const blocks = await client.fetchTeam(ref);
  assert.equal(blocks.pool.selected_equipe.libelle, 'HBC TEST');
  assert.equal(client.key, 'aNewKeyFromTheSite');
});

test('a page without a key is a clear error, not a JSON error', async () => {
  const site = createFakeFfhb();
  site.pageServesKey = false;
  const client = new FfhbClient({ fetch: site.fetch });
  await assert.rejects(client.fetchBlock(BLOCKS.MATCHES, {}), {
    name: 'FfhbError',
    message: /no decoding key/,
  });
});

test('a site down, or a refused block, is an FfhbError', async () => {
  const site = createFakeFfhb();
  const client = new FfhbClient({ fetch: site.fetch });
  await assert.rejects(client.fetchBlock('competitions---search-bar', {}), (err) => {
    assert.ok(err instanceof FfhbError);
    assert.equal(err.status, 400);
    return true;
  });
  site.down = true;
  await assert.rejects(client.fetchBlock(BLOCKS.MATCHES, {}), /ffhandball.fr unreachable/);
});

test('an answer that is already plain data is taken as is', async () => {
  const client = new FfhbClient({
    fetch: async () => Response.json({ rencontres: [] }),
  });
  assert.deepEqual(await client.fetchBlock(BLOCKS.MATCHES, {}), { rencontres: [] });
});

test('the teams of a competition are listed pool by pool, with their page address', async () => {
  const site = createFakeFfhb();
  const client = new FfhbClient({ fetch: site.fetch });
  const pools = await client.listTeams(parseCompetitionUrl(COMPETITION_URL));
  assert.equal(pools.length, 2);
  assert.equal(pools[0].teams.length, 4);
  assert.deepEqual(pools[0].teams[0], { name: 'HBC TEST', url: TEAM_URL });
  // One pool asked for: that pool only.
  const one = await client.listTeams(parseCompetitionUrl(`${COMPETITION_URL}poule-601/`));
  assert.equal(one.length, 1);
  assert.equal(one[0].teams.length, 2);
});
