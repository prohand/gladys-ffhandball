import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, tempDir } from './helpers/setup.js';
import { createFakeFfhb, setDate, setRank, setScore } from './helpers/fakeFfhb.js';
import { SCENE_TRIGGERS } from '../src/capabilities/scenes.js';

const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('the first read publishes the team and fires nothing: the past is not news', async () => {
  const { gladys, watcher, nudges } = await setup();
  assert.deepEqual(await watcher.refreshAll(), { ok: 1, failed: 0 });
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.ok(gladys.fake.states.length > 0);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.deepEqual(gladys.fake.transports, [
    { device_external_id: 'ext:test-integration:team:2001', transport: 'cloud' },
  ]);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(nudges.length, 1, 'the widgets are nudged after a refresh');
});

test('a new score fires one match_result, from the team side', async () => {
  const { gladys, watcher, site, clock } = await setup();
  await watcher.refreshAll();
  setScore(site.season, '3', 31, 29);
  clock.now = new Date('2026-10-17T19:00:00Z');
  await watcher.refreshAll();
  const [event] = eventsOf(gladys, SCENE_TRIGGERS.MATCH_RESULT);
  assert.equal(event.data.device, 'ext:test-integration:team:2001');
  assert.equal(event.data.result, 'win');
  assert.equal(event.data.venue, 'home');
  assert.equal(event.data.opponent, 'RIVAL C');
  assert.equal(event.data.score, '31-29');
  assert.equal(event.data.score_for, 31);
  assert.equal(event.data.summary, 'HBC TEST 31 – 29 RIVAL C');
  assert.equal(event.data.result_text, 'Victoire 31-29 contre RIVAL C');

  await watcher.refreshAll();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MATCH_RESULT).length, 1, 'once per result');
});

test('a corrected score or an old result seen late fires nothing', async () => {
  const { gladys, watcher, site, clock } = await setup();
  await watcher.refreshAll();
  // The score of match 1 is corrected on the site.
  setScore(site.season, '1', 30, 26);
  // Match 4, played a month ago, only now gets its score.
  setDate(site.season, '4', '2026-09-12T20:00:00+02:00');
  setScore(site.season, '4', 20, 22);
  clock.now = new Date('2026-10-16T13:00:00Z');
  await watcher.refreshAll();
  assert.deepEqual(eventsOf(gladys, SCENE_TRIGGERS.MATCH_RESULT), []);
});

test('a rank that moves fires ranking_changed with its direction', async () => {
  const { gladys, watcher, site } = await setup();
  await watcher.refreshAll();
  setRank(site.season, 'followed', 1);
  setRank(site.season, 'a', 2);
  await watcher.refreshAll();
  const [event] = eventsOf(gladys, SCENE_TRIGGERS.RANKING_CHANGED);
  assert.equal(event.data.rank, 1);
  assert.equal(event.data.previous_rank, 2);
  assert.equal(event.data.direction, 'up');
  setRank(site.season, 'followed', 3);
  await watcher.refreshAll();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.RANKING_CHANGED)[1].data.direction, 'down');
});

test('a kick-off moved on the site fires match_rescheduled', async () => {
  const { gladys, watcher, site } = await setup();
  await watcher.refreshAll();
  setDate(site.season, '3', '2026-10-18T16:00:00+02:00');
  await watcher.refreshAll();
  const [event] = eventsOf(gladys, SCENE_TRIGGERS.MATCH_RESCHEDULED);
  assert.equal(event.data.opponent, 'RIVAL C');
  assert.equal(event.data.previous_kickoff, '2026-10-17T17:00:00.000Z');
  assert.equal(event.data.kickoff, '2026-10-18T14:00:00.000Z');
  assert.equal(event.data.kickoff_text, 'dim. 18/10 16:00');
  assert.equal(event.data.previous_kickoff_text, 'sam. 17/10 19:00');
  // A match getting its first date is scheduled, not rescheduled.
  setDate(site.season, '4', '2026-11-07T20:00:00+01:00');
  await watcher.refreshAll();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MATCH_RESCHEDULED).length, 1);
});

test('the reminder fires once, the configured minutes before kick-off', async () => {
  const { gladys, watcher, clock } = await setup({ config: { reminder_minutes: 60 } });
  await watcher.refreshAll();
  // Kick-off 17:00 UTC: 16:05 is inside the hour before.
  clock.now = new Date('2026-10-17T15:55:00Z');
  await watcher.tick();
  assert.deepEqual(eventsOf(gladys, SCENE_TRIGGERS.MATCH_UPCOMING), []);
  clock.now = new Date('2026-10-17T16:05:00Z');
  await watcher.tick();
  await watcher.tick();
  const reminders = eventsOf(gladys, SCENE_TRIGGERS.MATCH_UPCOMING);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].data.minutes_before, 55);
  assert.equal(reminders[0].data.venue, 'home');
  assert.equal(reminders[0].data.kickoff_text, 'sam. 17/10 19:00');
});

test('a match moved after its reminder is reminded of again', async () => {
  const { gladys, watcher, site, clock } = await setup({ config: { reminder_minutes: 60 } });
  await watcher.refreshAll();
  clock.now = new Date('2026-10-17T16:30:00Z');
  await watcher.tick();
  setDate(site.season, '3', '2026-10-18T19:00:00+02:00');
  await watcher.refreshAll();
  clock.now = new Date('2026-10-18T16:30:00Z');
  await watcher.tick();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MATCH_UPCOMING).length, 2);
});

test('with 0 minutes, the reminder fires at kick-off', async () => {
  const { gladys, watcher, clock } = await setup({ config: { reminder_minutes: 0 } });
  await watcher.refreshAll();
  clock.now = new Date('2026-10-17T16:59:00Z');
  await watcher.tick();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MATCH_UPCOMING).length, 0);
  clock.now = new Date('2026-10-17T17:00:00Z');
  await watcher.tick();
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MATCH_UPCOMING).length, 1);
});

test('a restart remembers what was announced: nothing fires twice', async () => {
  const dir = await tempDir();
  const site = createFakeFfhb();
  const first = await setup({ dir, server: site, config: { reminder_minutes: 60 } });
  await first.watcher.refreshAll();
  setScore(site.season, '2', 28, 30);
  first.clock.now = new Date('2026-10-17T16:30:00Z');
  await first.watcher.refreshAll();
  assert.equal(eventsOf(first.gladys, SCENE_TRIGGERS.MATCH_UPCOMING).length, 1);
  const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  assert.ok(saved.teams['2001']);

  const second = await setup({ dir, server: site, config: { reminder_minutes: 60 } });
  second.clock.now = new Date('2026-10-17T16:31:00Z');
  await second.watcher.refreshAll();
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
});

test('a site down marks the team unreachable and says why, without crashing', async () => {
  const { gladys, watcher, site } = await setup();
  site.down = true;
  assert.deepEqual(await watcher.refreshAll(), { ok: 0, failed: 1 });
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.fr, /ffhandball.fr ne peut pas être lu: ffhandball.fr unreachable/);
  // The device still exists, named after its id.
  assert.equal(gladys.fake.discoveredDevices[0].name, 'FFHandball – 2001');
});

test('without any team, the Configuration screen asks for one', async () => {
  const { gladys, watcher } = await setup({ config: { teams: '' } });
  await watcher.refreshAll();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /paste the address of a team page/);
});

test('two refreshes asked at once share one read', async () => {
  const { watcher, site } = await setup();
  await Promise.all([watcher.refreshAll(), watcher.refreshAll()]);
  assert.equal(site.calls.filter((call) => call.includes('rencontre-list')).length, 1);
});

test('a team removed from the configuration is no longer followed', async () => {
  const { gladys, watcher } = await setup();
  await watcher.refreshAll();
  watcher.setConfig({ ...watcher.config, teams: '' });
  await watcher.refreshAll();
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.deepEqual(watcher.teams(), []);
});

test('start runs a first refresh and arms both clocks, stop disarms them', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { watcher, site } = await setup({ config: { refresh_minutes: 30 } });
  await watcher.start();
  const reads = () => site.calls.filter((call) => call.includes('rencontre-list')).length;
  assert.equal(reads(), 1);
  t.mock.timers.tick(30 * 60_000);
  await watcher.running;
  assert.equal(reads(), 2);
  watcher.stop();
  t.mock.timers.tick(60 * 60_000);
  assert.equal(reads(), 2);
});
