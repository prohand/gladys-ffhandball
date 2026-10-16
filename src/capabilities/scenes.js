// -----------------------------------------------------------------------------
// Scene triggers and scene actions (SDK v0.14+, Gladys 5.1+).
//
// Triggers say "this happened" — a result came in, a match is about to start,
// the rank moved, a match was moved. They are fired by src/watcher.js when it
// sees the change, once per change, and never in answer to a scene action
// (a scene bound to the event would loop through the integration).
//
// Actions read what the integration knows about one team for the following
// actions of a scene: the next match, the last result, the standing. They
// read, they never refresh: an action that refreshed could fire a trigger.
//
// Every key below is stored in the users' scenes: never rename one.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import {
  daysUntil,
  formatKickoff,
  matchTitle,
  RESULT_LABELS,
  resultSentence,
} from '../ffhandball/format.js';
import { lastMatch, nextMatch } from '../ffhandball/team.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  MATCH_RESULT: 'match_result',
  MATCH_UPCOMING: 'match_upcoming',
  RANKING_CHANGED: 'ranking_changed',
  MATCH_RESCHEDULED: 'match_rescheduled',
};

export const RANK_DIRECTIONS = { UP: 'up', DOWN: 'down' };

const iso = (date) => (date ? date.toISOString() : null);

/** The common part of every match event: who plays whom, where. */
function matchData(deviceExternalId, team, match, language) {
  return {
    device: deviceExternalId,
    team: team.name,
    opponent: match.opponent,
    venue: match.venue,
    competition: team.competition,
    summary: matchTitle(match),
    kickoff: iso(match.date),
    kickoff_text: formatKickoff(match.date, language),
  };
}

/** The data of the events src/watcher.js fires, flat and declared. */
export const sceneEventData = {
  matchResult(deviceExternalId, team, match, language) {
    return {
      ...matchData(deviceExternalId, team, match, language),
      result: match.result,
      result_text: resultSentence(match, language),
      score_for: match.scoreFor,
      score_against: match.scoreAgainst,
      score: `${match.scoreFor}-${match.scoreAgainst}`,
    };
  },
  matchUpcoming(deviceExternalId, team, match, language, now = new Date()) {
    return {
      ...matchData(deviceExternalId, team, match, language),
      minutes_before: Math.max(0, Math.round((match.date - now) / 60_000)),
    };
  },
  rankingChanged(deviceExternalId, team, previousRank) {
    const rank = team.standing.rank;
    return {
      device: deviceExternalId,
      team: team.name,
      competition: team.competition,
      rank,
      previous_rank: previousRank,
      points: team.standing.points,
      direction: rank < previousRank ? RANK_DIRECTIONS.UP : RANK_DIRECTIONS.DOWN,
    };
  },
  matchRescheduled(deviceExternalId, team, match, previousKickoff, language) {
    return {
      ...matchData(deviceExternalId, team, match, language),
      previous_kickoff: iso(previousKickoff),
      previous_kickoff_text: formatKickoff(previousKickoff, language),
    };
  },
};

/**
 * The scene actions, keyed by their manifest `key`. Each handler receives
 * `(watcher, { fields, config })` — `fields.device` is the chosen team device
 * (a `"source": "devices"` select) — and resolves the declared outputs.
 */
export const SCENE_ACTIONS = {
  async get_next_match(watcher, { fields, config }) {
    const team = await watcher.teamForDevice(fields.device);
    const match = nextMatch(team, watcher.now());
    logger.info(`Scene action get_next_match <- ${team.name}`);
    if (!match) {
      return { found: false, team: team.name };
    }
    return {
      found: true,
      team: team.name,
      opponent: match.opponent,
      venue: match.venue,
      kickoff: iso(match.date),
      kickoff_text: formatKickoff(match.date, config.language),
      days_until: Math.max(0, daysUntil(match.date, watcher.now())),
      competition: team.competition,
      summary: matchTitle(match),
    };
  },

  async get_last_result(watcher, { fields, config }) {
    const team = await watcher.teamForDevice(fields.device);
    const match = lastMatch(team);
    logger.info(`Scene action get_last_result <- ${team.name}`);
    if (!match) {
      return { found: false, team: team.name };
    }
    return {
      found: true,
      team: team.name,
      opponent: match.opponent,
      venue: match.venue,
      result: match.result,
      result_text: pick(config.language, RESULT_LABELS[match.result]),
      score_for: match.scoreFor,
      score_against: match.scoreAgainst,
      summary: matchTitle(match),
    };
  },

  async get_standing(watcher, { fields }) {
    const team = await watcher.teamForDevice(fields.device);
    logger.info(`Scene action get_standing <- ${team.name}`);
    const { standing } = team;
    if (!standing) {
      return { found: false, team: team.name };
    }
    return {
      found: true,
      team: team.name,
      rank: standing.rank,
      points: standing.points,
      played: standing.played,
      won: standing.won,
      drawn: standing.drawn,
      lost: standing.lost,
      goal_difference: standing.goalDifference,
      teams_in_pool: team.standings.length,
    };
  },
};
