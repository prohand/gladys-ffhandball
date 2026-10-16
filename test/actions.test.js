import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/setup.js';
import { COMPETITION_URL, TEAM_URL } from './helpers/fakeFfhb.js';
import { ACTION_KEYS, ACTIONS } from '../src/capabilities/actions.js';
import { LANGUAGES } from '../src/i18n.js';

const testConnection = ACTIONS[ACTION_KEYS.TEST_CONNECTION];
const listTeams = ACTIONS[ACTION_KEYS.LIST_TEAMS];

test('Test the connection says, team by team, what the site answered', async () => {
  const { watcher } = await setup({ config: { teams: `${TEAM_URL}\nnot-a-url` } });
  const message = await testConnection(watcher);
  assert.deepEqual(Object.keys(message).sort(), [...LANGUAGES].sort());
  assert.match(message.fr, /✓ HBC TEST \(PRENATIONALE MASCULINE TEST – POULE 1\)/);
  assert.match(message.fr, /2e · 5 pts · prochain: sam\. 17\/10 19:00 – RIVAL C/);
  assert.match(message.en, /✗ not-a-url\n {3}not a team page of ffhandball\.fr/);
});

test('Test the connection names the failure of an unreachable site', async () => {
  const { watcher, site } = await setup();
  site.down = true;
  const message = await testConnection(watcher);
  assert.match(message.en, /✗ https:\/\/www\.ffhandball\.fr\/.*\n {3}ffhandball\.fr unreachable/);
});

test('Test the connection without any team explains what to paste', async () => {
  const { watcher } = await setup({ config: { teams: '' } });
  const message = await testConnection(watcher);
  assert.match(message.fr, /Collez l'adresse d'une page équipe/);
});

test('List the teams gives the address of every team, pool by pool', async () => {
  const { watcher } = await setup();
  const message = await listTeams(watcher, { fields: { url: COMPETITION_URL } });
  assert.match(message.fr, /^Copiez l'adresse de votre équipe/);
  assert.match(message.fr, /— POULE 1\nHBC TEST\nhttps:\/\/www\.ffhandball\.fr\/.*\/equipe-2001\//);
  assert.match(message.fr, /— POULE 2/);
});

test('List the teams explains what address it needs', async () => {
  const { watcher } = await setup();
  const message = await listTeams(watcher, { fields: { url: 'https://example.org' } });
  assert.match(message.en, /Not a competition page of ffhandball\.fr/);
});
