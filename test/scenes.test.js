import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup } from './helpers/setup.js';
import { setDate, setRank, setScore } from './helpers/fakeFfhb.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const DEVICE = 'ext:test-integration:team:2001';

/** One event of every trigger, from a season that moves. */
async function everyEvent() {
  const { gladys, watcher, site, clock } = await setup({ config: { reminder_minutes: 60 } });
  await watcher.refreshAll();
  setRank(site.season, 'followed', 1);
  setDate(site.season, '3', '2026-10-17T20:00:00+02:00');
  await watcher.refreshAll();
  clock.now = new Date('2026-10-17T17:30:00Z');
  await watcher.tick();
  setScore(site.season, '3', 25, 27);
  clock.now = new Date('2026-10-17T20:00:00Z');
  await watcher.refreshAll();
  return gladys.fake.sceneEvents;
}

test('every declared trigger is fired, and only declared ones', async () => {
  const events = await everyEvent();
  assert.deepEqual(
    [...new Set(events.map((event) => event.key))].sort(),
    keysOf(manifest.scene_triggers).sort(),
  );
});

test('the event data only carries declared, flat keys', async () => {
  for (const { key, data } of await everyEvent()) {
    const trigger = declarationOf('scene_triggers', key);
    // The core keeps the `fields` keys (filters) and the `variables` keys
    // (exposed to the scene): any other key is dropped, so it is a bug here.
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    const extra = Object.keys(data).filter((k) => !declared.includes(k));
    assert.deepEqual(extra, [], `${key}: undeclared keys`);
    assert.ok(Object.keys(data).length <= 30, `${key}: at most 30 keys`);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `${key}.${name} must be a primitive`,
      );
    }
    // The filters: the chosen device, and a value among the declared options.
    assert.equal(data.device, DEVICE);
    for (const field of trigger.fields.filter((f) => f.options)) {
      assert.ok(
        field.options.some((option) => option.value === data[field.key]),
        `${key}.${field.key} = ${data[field.key]} is not an option`,
      );
    }
  }
});

test('the event keys the triggers filter on are declared as fields', () => {
  assert.deepEqual(keysOf(declarationOf('scene_triggers', SCENE_TRIGGERS.MATCH_RESULT).fields), [
    'device',
    'result',
    'venue',
  ]);
  assert.deepEqual(keysOf(declarationOf('scene_triggers', SCENE_TRIGGERS.RANKING_CHANGED).fields), [
    'device',
    'direction',
  ]);
});

test('every scene action returns its declared outputs, and only them', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    const outputs = await handler(watcher, { fields: { device: DEVICE }, config: watcher.config });
    const declared = keysOf(declarationOf('scene_actions', key).outputs);
    for (const [name, value] of Object.entries(outputs)) {
      assert.ok(declared.includes(name), `${key}: output "${name}" is not declared`);
      assert.ok(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `${key}.${name} must be a scalar`,
      );
    }
    assert.equal(outputs.found, true, `${key} found the team's data`);
  }
});

test('the scene actions read what the team is, from its side', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  const fields = { device: DEVICE };
  const next = await SCENE_ACTIONS.get_next_match(watcher, { fields, config: watcher.config });
  assert.equal(next.opponent, 'RIVAL C');
  assert.equal(next.days_until, 1);
  assert.equal(next.venue, 'home');
  const last = await SCENE_ACTIONS.get_last_result(watcher, { fields, config: watcher.config });
  assert.equal(last.result, 'draw');
  assert.equal(last.result_text, 'Nul');
  const standing = await SCENE_ACTIONS.get_standing(watcher, { fields, config: watcher.config });
  assert.equal(standing.rank, 2);
  assert.equal(standing.teams_in_pool, 4);
});

test('a scene action reads a team never read yet, and fires nothing doing so', async () => {
  const { watcher, gladys } = await setup();
  const outputs = await SCENE_ACTIONS.get_standing(watcher, {
    fields: { device: DEVICE },
    config: watcher.config,
  });
  assert.equal(outputs.rank, 2);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a scene action on a team that is not followed fails that action', async () => {
  const { watcher } = await setup();
  await assert.rejects(
    SCENE_ACTIONS.get_standing(watcher, {
      fields: { device: 'ext:test-integration:team:42' },
      config: watcher.config,
    }),
    /Not a followed team/,
  );
});

test('no match to come is an output, not a failure', async () => {
  const { watcher, clock } = await setup();
  await watcher.refreshAll();
  clock.now = new Date('2026-12-01T12:00:00Z');
  const outputs = await SCENE_ACTIONS.get_next_match(watcher, {
    fields: { device: DEVICE },
    config: watcher.config,
  });
  assert.deepEqual(outputs, { found: false, team: 'HBC TEST' });
});
