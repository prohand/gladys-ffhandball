// -----------------------------------------------------------------------------
// The followed teams, read from ffhandball.fr and turned into Gladys states and
// scene events.
//
// Two clocks:
//   - the refresh, every `refresh_minutes`: read every team (the site caches
//     its answers an hour, reading it more often brings nothing), publish the
//     states that changed, fire the events the change carries (a new result,
//     a rank that moved, a kick-off moved);
//   - the tick, every minute, on what is already in memory: the "match about
//     to start" reminder and the "next match in N days" count, which move with
//     the clock and not with the site.
//
// Gladys does not poll these devices (`should_poll: false`): the integration
// owns both clocks, and a team's events fire whether or not its device was
// created yet.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { localize, pick } from './i18n.js';
import { parseTeams } from './config.js';
import { buildTeam } from './ffhandball/team.js';
import { buildDevice, buildStates, deviceExternalId, teamIdOf } from './devices/team.js';
import { SCENE_TRIGGERS, sceneEventData } from './capabilities/scenes.js';

const logger = createLogger({ name: 'watcher' });

const MINUTE_MS = 60_000;
// A result older than this, first seen now (the integration was stopped for
// days), is history, not news: it is memorized without firing.
const RESULT_NEWS_MS = 3 * 24 * 60 * MINUTE_MS;
// The "about to start" reminder still fires this long after the kick-off, for a
// refresh or a restart that came just too late.
const REMINDER_GRACE_MS = 10 * MINUTE_MS;
// An unchanged value is re-sent this often, so it stays recently dated in
// Gladys (the standings move once a week).
const HEARTBEAT_MS = 6 * 60 * MINUTE_MS;

export class TeamWatcher {
  /**
   * @param {object} options
   * @param {object} options.gladys the SDK client
   * @param {import('./ffhandball/client.js').FfhbClient} options.client
   * @param {import('./store.js').Store} options.store
   * @param {() => Date} [options.now] the clock, injected in the tests
   * @param {(gladys: object) => void} [options.onRefreshed] nudges the widgets
   */
  constructor({ gladys, client, store, now = () => new Date(), onRefreshed = () => {} }) {
    this.gladys = gladys;
    this.client = client;
    this.store = store;
    this.now = now;
    this.onRefreshed = onRefreshed;
    this.config = null;
    this.refs = [];
    this.invalid = [];
    // teamId -> { ref, team, error, readAt }
    this.entries = new Map();
    this.running = null;
    this.publishedDevices = null;
    this.refreshTimer = null;
    this.tickTimer = null;
  }

  /** Take a (new) configuration: which teams to follow. */
  setConfig(config) {
    this.config = config;
    const { teams, invalid } = parseTeams(config.teams);
    this.refs = teams;
    this.invalid = invalid;
    for (const invalidEntry of invalid) {
      logger.warn(`Not a ffhandball.fr team page, ignored: ${invalidEntry}`);
    }
    const followed = new Set(teams.map((ref) => ref.teamId));
    for (const teamId of this.entries.keys()) {
      if (!followed.has(teamId)) {
        this.entries.delete(teamId);
      }
    }
    for (const ref of teams) {
      const entry = this.entries.get(ref.teamId);
      if (entry) {
        entry.ref = ref;
      } else {
        this.entries.set(ref.teamId, { ref, team: null, error: null, readAt: null });
      }
    }
  }

  /** The followed teams, in the order of the configuration. */
  list() {
    return this.refs.map((ref) => this.entries.get(ref.teamId));
  }

  /** The teams read successfully, in the order of the configuration. */
  teams() {
    return this.list()
      .map((entry) => entry?.team)
      .filter(Boolean);
  }

  /** The discovery payload: one device per followed team. */
  buildDiscoveredDevices() {
    return this.list().map((entry) => buildDevice(this.gladys, entry.ref, entry.team, this.config));
  }

  /** Publish the devices again when what they look like changed (team names). */
  async publishDevices({ force = false } = {}) {
    const devices = this.buildDiscoveredDevices();
    const signature = JSON.stringify(devices);
    if (!force && signature === this.publishedDevices) {
      return;
    }
    await this.gladys.publishDiscoveredDevices(devices);
    this.publishedDevices = signature;
  }

  /** Start both clocks. The first refresh runs at once. */
  start() {
    this.stop();
    this.refreshTimer = setInterval(
      () => this.refreshAll().catch((err) => logger.error('Refresh failed', err)),
      this.config.refresh_minutes * MINUTE_MS,
    );
    this.tickTimer = setInterval(
      () => this.tick().catch((err) => logger.error('Tick failed', err)),
      MINUTE_MS,
    );
    return this.refreshAll();
  }

  stop() {
    clearInterval(this.refreshTimer);
    clearInterval(this.tickTimer);
    this.refreshTimer = null;
    this.tickTimer = null;
  }

  /**
   * Read every followed team. Concurrent calls share the same run.
   * @returns {Promise<{ ok: number, failed: number }>}
   */
  refreshAll() {
    this.running ??= this.runRefresh().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async runRefresh() {
    let ok = 0;
    let failed = 0;
    for (const entry of this.list()) {
      try {
        await this.readTeam(entry);
        await this.detectChanges(entry.team);
        ok += 1;
      } catch (err) {
        entry.error = err;
        failed += 1;
        logger.error(`Could not read ${entry.ref.url}: ${err.message}`);
      }
    }
    await this.safely('publish the devices', () => this.publishDevices());
    await this.safely('publish the states', () => this.publishStates());
    await this.safely('publish the transports', () => this.publishTransports());
    await this.safely('fire the reminders', () => this.fireReminders());
    this.store.prune(this.now().getTime());
    await this.store.save();
    await this.safely('report the connection status', () => this.reportStatus(ok, failed));
    this.onRefreshed(this.gladys);
    logger.info(`Refresh done: ${ok} team(s) read, ${failed} failed`);
    return { ok, failed };
  }

  /** Every minute: what moves with the clock, from what is in memory. */
  async tick() {
    await this.safely('publish the states', () => this.publishStates());
    await this.safely('fire the reminders', () => this.fireReminders());
    await this.store.save();
  }

  async readTeam(entry) {
    const blocks = await this.client.fetchTeam(entry.ref);
    entry.team = buildTeam(entry.ref, blocks);
    entry.error = null;
    entry.readAt = this.now();
  }

  /**
   * The team of one of this integration's devices, for the scene actions: from
   * memory, or read now when it never was (no event fires from that read).
   */
  async teamForDevice(externalId) {
    const teamId = teamIdOf(this.gladys, externalId);
    const entry = teamId ? this.entries.get(teamId) : null;
    if (!entry) {
      throw new Error(`Not a followed team: ${externalId}`);
    }
    if (!entry.team) {
      await this.readTeam(entry);
    }
    return entry.team;
  }

  async publishStates() {
    const states = this.teams().flatMap((team) =>
      buildStates(this.gladys, team, this.config, this.now()),
    );
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
  }

  async publishTransports() {
    const entries = this.list().map((entry) => ({
      external_id: deviceExternalId(this.gladys, entry.ref.teamId),
      transport:
        entry.error || !entry.team ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.CLOUD,
    }));
    for (let i = 0; i < entries.length; i += 100) {
      await this.gladys.publishTransports(entries.slice(i, i + 100));
    }
  }

  async reportStatus(ok, failed) {
    if (this.refs.length === 0) {
      await this.gladys.setConnectionStatus(false, {
        en: 'No team followed yet: paste the address of a team page of ffhandball.fr.',
        fr: "Aucune équipe suivie : collez l'adresse d'une page équipe de ffhandball.fr.",
        de: 'Noch keine Mannschaft: füge die Adresse einer Mannschaftsseite von ffhandball.fr ein.',
        es: 'Aún no sigue ningún equipo: pegue la dirección de una página de equipo de ffhandball.fr.',
      });
      return;
    }
    if (ok === 0 && failed > 0) {
      const reason = this.list().find((entry) => entry.error)?.error?.message ?? '';
      await this.gladys.setConnectionStatus(
        false,
        localize(
          (language) =>
            `${pick(language, {
              en: 'ffhandball.fr could not be read',
              fr: 'ffhandball.fr ne peut pas être lu',
              de: 'ffhandball.fr konnte nicht gelesen werden',
              es: 'No se pudo leer ffhandball.fr',
            })}: ${reason}`,
        ),
      );
      return;
    }
    await this.gladys.setConnectionStatus(true);
  }

  async publishEvent(key, data) {
    logger.info(`Scene event ${key} <- ${data.team}`);
    await this.safely(`fire ${key}`, () => this.gladys.publishSceneEvent(key, data));
  }

  /** Compare what was just read with what was memorized, and fire the news. */
  async detectChanges(team) {
    const known = this.store.knows(team.id);
    const memory = this.store.team(team.id);
    const now = this.now().getTime();
    const device = deviceExternalId(this.gladys, team.id);
    const { language } = this.config;

    for (const match of team.matches) {
      if (match.played) {
        const score = `${match.homeScore}-${match.awayScore}`;
        const previous = memory.results[match.id];
        if (previous?.score === score) {
          continue;
        }
        this.store.set(team.id, 'results', match.id, {
          score,
          at: match.date?.getTime() ?? now,
        });
        // A score that only got corrected is not a new result.
        const recent = !match.date || now - match.date.getTime() < RESULT_NEWS_MS;
        if (known && !previous && recent) {
          await this.publishEvent(
            SCENE_TRIGGERS.MATCH_RESULT,
            sceneEventData.matchResult(device, team, match, language),
          );
        }
      } else if (match.date) {
        const kickoff = match.date.getTime();
        const previous = memory.kickoffs[match.id];
        if (previous === kickoff) {
          continue;
        }
        this.store.set(team.id, 'kickoffs', match.id, kickoff);
        if (known && previous !== undefined && kickoff > now) {
          await this.publishEvent(
            SCENE_TRIGGERS.MATCH_RESCHEDULED,
            sceneEventData.matchRescheduled(device, team, match, new Date(previous), language),
          );
        }
      }
    }

    const rank = team.standing?.rank ?? null;
    if (rank !== null && rank !== memory.rank) {
      const previous = memory.rank;
      this.store.set(team.id, 'rank', null, rank);
      if (known && previous !== null) {
        await this.publishEvent(
          SCENE_TRIGGERS.RANKING_CHANGED,
          sceneEventData.rankingChanged(device, team, previous),
        );
      }
    }
  }

  /** The "match about to start" reminders that are due, once per kick-off. */
  async fireReminders() {
    const now = this.now();
    const lead = this.config.reminder_minutes * MINUTE_MS;
    for (const team of this.teams()) {
      const memory = this.store.team(team.id);
      for (const match of team.matches) {
        if (match.played || !match.date) {
          continue;
        }
        const kickoff = match.date.getTime();
        const due = now.getTime() >= kickoff - lead && now.getTime() <= kickoff + REMINDER_GRACE_MS;
        // The memory holds the kick-off it reminded of: a match moved to
        // another day is reminded of again.
        if (!due || memory.reminded[match.id] === kickoff) {
          continue;
        }
        this.store.set(team.id, 'reminded', match.id, kickoff);
        await this.publishEvent(
          SCENE_TRIGGERS.MATCH_UPCOMING,
          sceneEventData.matchUpcoming(
            deviceExternalId(this.gladys, team.id),
            team,
            match,
            this.config.language,
            now,
          ),
        );
      }
    }
  }

  async safely(what, run) {
    try {
      await run();
    } catch (err) {
      logger.error(`Could not ${what}: ${err.message}`);
    }
  }
}
