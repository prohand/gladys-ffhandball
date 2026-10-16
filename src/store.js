// -----------------------------------------------------------------------------
// What the integration already announced, kept across restarts.
//
// The scene triggers fire on CHANGES: a score that appears, a rank that moves,
// a kick-off that is close. After an update or a Gladys restart, the
// integration reads the same season again: without a memory, every result of
// the season would be a "new" result and every scene bound to it would run.
//
// Kept in `/data/state.json`, the only writable path of the container. A team
// seen for the first time is only memorized (its past is not news); the events
// start from the next change. When `/data` cannot be written (a run outside the
// container), the memory simply lives as long as the process.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = process.env.FFHANDBALL_DATA_DIR || '/data';

// How long a match is remembered after it was played or announced: past that,
// it can no longer change, and the file must not grow season after season.
const FORGET_AFTER_MS = 120 * 24 * 60 * 60 * 1000;

function emptyTeam() {
  return { rank: null, results: {}, kickoffs: {}, reminded: {} };
}

export class Store {
  constructor({ dir = DEFAULT_DATA_DIR } = {}) {
    this.file = join(dir, 'state.json');
    this.dir = dir;
    this.data = { version: 1, teams: {} };
    this.dirty = false;
    this.writable = true;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'));
      if (parsed && typeof parsed.teams === 'object') {
        this.data = { version: 1, teams: parsed.teams };
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Could not read ${this.file}, starting with an empty memory: ${err.message}`);
      }
    }
    return this;
  }

  /** Whether a team was already seen (its events can fire). */
  knows(teamId) {
    return Boolean(this.data.teams[teamId]);
  }

  team(teamId) {
    if (!this.data.teams[teamId]) {
      this.data.teams[teamId] = emptyTeam();
      this.dirty = true;
    }
    return this.data.teams[teamId];
  }

  set(teamId, section, key, value) {
    const team = this.team(teamId);
    if (section === 'rank') {
      if (team.rank !== value) {
        team.rank = value;
        this.dirty = true;
      }
      return;
    }
    if (team[section][key] !== value) {
      team[section][key] = value;
      this.dirty = true;
    }
  }

  /** Drop the matches nothing can change any more. */
  prune(now = Date.now()) {
    for (const team of Object.values(this.data.teams)) {
      for (const section of ['results', 'kickoffs', 'reminded']) {
        for (const [key, value] of Object.entries(team[section])) {
          const at = typeof value === 'number' ? value : (value?.at ?? null);
          if (at !== null && now - at > FORGET_AFTER_MS) {
            delete team[section][key];
            this.dirty = true;
          }
        }
      }
    }
  }

  async save() {
    if (!this.dirty || !this.writable) {
      return;
    }
    try {
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data));
      await rename(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      this.writable = false;
      logger.warn(
        `Could not write ${this.file}: the memory of the events lasts until the next restart (${err.message})`,
      );
    }
  }
}
