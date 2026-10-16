// Shared set-up of the tests: a watcher on the fake site, a fake Gladys, a
// memory in a temporary directory and a clock the test moves.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../../src/config.js';
import { FfhbClient } from '../../src/ffhandball/client.js';
import { Store } from '../../src/store.js';
import { TeamWatcher } from '../../src/watcher.js';
import { createFakeFfhb, TEAM_URL } from './fakeFfhb.js';

// Friday 16 October 2026, 14:00 in Paris: the day before match 3.
export const NOW = new Date('2026-10-16T12:00:00Z');

export async function tempDir() {
  return mkdtemp(join(tmpdir(), 'gladys-ffhandball-'));
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw configuration, merged on the defaults
 * @param {string} [options.dir] memory directory (a new one by default)
 * @param {object} [options.server] a fake site (a new one by default)
 */
export async function setup({ config = {}, dir, server } = {}) {
  const site = server ?? createFakeFfhb();
  const clock = { now: new Date(NOW) };
  const gladys = createFakeGladys();
  const store = await new Store({ dir: dir ?? (await tempDir()) }).load();
  const client = new FfhbClient({ fetch: site.fetch });
  const nudges = [];
  const watcher = new TeamWatcher({
    gladys,
    client,
    store,
    now: () => clock.now,
    onRefreshed: () => nudges.push(clock.now),
  });
  watcher.setConfig(normalizeConfig({ teams: TEAM_URL, ...config }));
  return { site, clock, gladys, store, client, watcher, nudges };
}
