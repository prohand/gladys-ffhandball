import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig, parseTeamUrl } from '../src/config.js';
import {
  buildDevice,
  buildStates,
  deviceExternalId,
  FEATURES,
  teamIdOf,
} from '../src/devices/team.js';
import { setup, NOW } from './helpers/setup.js';
import { TEAM_URL } from './helpers/fakeFfhb.js';

test('Gladys accepts the device of a team, read or not yet read', async () => {
  const { gladys, watcher } = await setup();
  // Before the first read: named after its id.
  const before = buildDevice(gladys, parseTeamUrl(TEAM_URL), null, normalizeConfig());
  assert.equal(before.name, 'FFHandball – 2001');
  await gladys.publishDiscoveredDevices([before]);

  await watcher.refreshAll();
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'FFHandball – HBC TEST');
  assert.equal(device.external_id, 'ext:test-integration:team:2001');
  // Gladys stores min/max NOT NULL, and nothing here is controllable.
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', feature.external_id);
    assert.equal(typeof feature.max, 'number', feature.external_id);
    assert.equal(feature.read_only, true);
  }
});

test('the feature names follow the configured language', async () => {
  const { gladys } = await setup();
  const ref = parseTeamUrl(TEAM_URL);
  const names = (language) =>
    buildDevice(gladys, ref, null, normalizeConfig({ language })).features.map((f) => f.name);
  assert.equal(names('fr')[0], 'Classement');
  assert.equal(names('en')[0], 'Rank');
  assert.equal(names('de')[0], 'Platz');
  assert.equal(names('es')[0], 'Posición');
});

test('Gladys accepts the states of a team, numbers and texts', async () => {
  const { gladys, watcher } = await setup();
  await watcher.refreshAll();
  const [team] = watcher.teams();
  const states = buildStates(gladys, team, watcher.config, NOW);
  await gladys.publishStates(states);
  const id = (key) => `ext:test-integration:team:2001:${key}`;
  assert.equal(gladys.fake.lastState(id(FEATURES.RANK)), 2);
  assert.equal(gladys.fake.lastState(id(FEATURES.POINTS)), 5);
  assert.equal(gladys.fake.lastState(id(FEATURES.LAST_RESULT)), 0);
  assert.equal(gladys.fake.lastState(id(FEATURES.LAST_SCORE_FOR)), 28);
  assert.equal(gladys.fake.lastState(id(FEATURES.LAST_MATCH)), 'Nul 28-28 contre RIVAL B');
  assert.equal(
    gladys.fake.lastState(id(FEATURES.NEXT_MATCH)),
    'sam. 17/10 19:00 · HBC TEST – RIVAL C',
  );
  assert.equal(gladys.fake.lastState(id(FEATURES.NEXT_MATCH_DAYS)), 1);
});

test('without a match to come, the next match says so and its day count is left alone', async () => {
  const { gladys, watcher } = await setup();
  await watcher.refreshAll();
  const [team] = watcher.teams();
  const states = buildStates(gladys, team, watcher.config, new Date('2026-12-01T12:00:00Z'));
  const next = states.find((s) => s.device_feature_external_id.endsWith(FEATURES.NEXT_MATCH));
  assert.equal(next.text, 'Aucun match programmé');
  assert.ok(!states.some((s) => s.device_feature_external_id.endsWith(FEATURES.NEXT_MATCH_DAYS)));
});

test('a device external id gives its team back, a foreign one gives nothing', () => {
  const gladys = createFakeGladys();
  assert.equal(teamIdOf(gladys, deviceExternalId(gladys, '2001')), '2001');
  assert.equal(teamIdOf(gladys, 'ext:test-integration:team:2001:rank'), '2001');
  assert.equal(teamIdOf(gladys, 'ext:other:team:2001'), null);
  assert.equal(teamIdOf(gladys, undefined), null);
});
