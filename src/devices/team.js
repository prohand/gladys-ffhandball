// -----------------------------------------------------------------------------
// Device type: FOLLOWED TEAM
//
// One Gladys device per team pasted in the configuration. Its features are
// read-only sensors: the standing of the team in its pool, its last result and
// its next match. They are what the dashboard device cards, the scene
// conditions ("if the rank is 1…") and the widgets' live tiles read.
//
// The device external id is built on the team id of ffhandball.fr, which is
// stable for the season: the same team pasted again is the same device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import { daysUntil, nextMatchSentence, resultSentence } from '../ffhandball/format.js';
import { lastMatch, nextMatch, RESULT_VALUES } from '../ffhandball/team.js';

export const DEVICE_TYPE = 'team';

// Feature keys: part of the external ids, never rename them.
export const FEATURES = {
  RANK: 'rank',
  POINTS: 'points',
  PLAYED: 'played',
  WON: 'won',
  DRAWN: 'drawn',
  LOST: 'lost',
  GOAL_DIFFERENCE: 'goal-difference',
  LAST_RESULT: 'last-result',
  LAST_SCORE_FOR: 'last-score-for',
  LAST_SCORE_AGAINST: 'last-score-against',
  LAST_MATCH: 'last-match',
  NEXT_MATCH: 'next-match',
  NEXT_MATCH_DAYS: 'next-match-days',
};

const COUNTER = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
};
const TEXT = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
};

// The features, in the order the device card shows them. Every feature
// declares `min`/`max`: Gladys stores them NOT NULL.
const FEATURE_DEFINITIONS = [
  {
    key: FEATURES.RANK,
    ...COUNTER,
    min: 0,
    max: 100,
    name: { en: 'Rank', fr: 'Classement', de: 'Platz', es: 'Posición' },
  },
  {
    key: FEATURES.POINTS,
    ...COUNTER,
    min: -100,
    max: 500,
    name: { en: 'Points', fr: 'Points', de: 'Punkte', es: 'Puntos' },
  },
  {
    key: FEATURES.PLAYED,
    ...COUNTER,
    min: 0,
    max: 200,
    name: { en: 'Played', fr: 'Joués', de: 'Spiele', es: 'Jugados' },
  },
  {
    key: FEATURES.WON,
    ...COUNTER,
    min: 0,
    max: 200,
    name: { en: 'Won', fr: 'Gagnés', de: 'Siege', es: 'Ganados' },
  },
  {
    key: FEATURES.DRAWN,
    ...COUNTER,
    min: 0,
    max: 200,
    name: { en: 'Drawn', fr: 'Nuls', de: 'Unentschieden', es: 'Empatados' },
  },
  {
    key: FEATURES.LOST,
    ...COUNTER,
    min: 0,
    max: 200,
    name: { en: 'Lost', fr: 'Perdus', de: 'Niederlagen', es: 'Perdidos' },
  },
  {
    key: FEATURES.GOAL_DIFFERENCE,
    ...COUNTER,
    min: -5000,
    max: 5000,
    name: {
      en: 'Goal difference',
      fr: 'Différence de buts',
      de: 'Tordifferenz',
      es: 'Diferencia de goles',
    },
  },
  {
    key: FEATURES.LAST_RESULT,
    ...COUNTER,
    min: -1,
    max: 1,
    name: {
      en: 'Last result (1 win, 0 draw, -1 loss)',
      fr: 'Dernier résultat (1 victoire, 0 nul, -1 défaite)',
      de: 'Letztes Ergebnis (1 Sieg, 0 Remis, -1 Niederlage)',
      es: 'Último resultado (1 victoria, 0 empate, -1 derrota)',
    },
  },
  {
    key: FEATURES.LAST_SCORE_FOR,
    ...COUNTER,
    min: 0,
    max: 200,
    name: {
      en: 'Last match: goals scored',
      fr: 'Dernier match : buts marqués',
      de: 'Letztes Spiel: erzielte Tore',
      es: 'Último partido: goles a favor',
    },
  },
  {
    key: FEATURES.LAST_SCORE_AGAINST,
    ...COUNTER,
    min: 0,
    max: 200,
    name: {
      en: 'Last match: goals conceded',
      fr: 'Dernier match : buts encaissés',
      de: 'Letztes Spiel: Gegentore',
      es: 'Último partido: goles en contra',
    },
  },
  {
    key: FEATURES.LAST_MATCH,
    ...TEXT,
    min: 0,
    max: 0,
    name: { en: 'Last match', fr: 'Dernier match', de: 'Letztes Spiel', es: 'Último partido' },
  },
  {
    key: FEATURES.NEXT_MATCH,
    ...TEXT,
    min: 0,
    max: 0,
    name: {
      en: 'Next match',
      fr: 'Prochain match',
      de: 'Nächstes Spiel',
      es: 'Próximo partido',
    },
  },
  {
    key: FEATURES.NEXT_MATCH_DAYS,
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    unit: DEVICE_FEATURE_UNITS.DAYS,
    min: 0,
    max: 366,
    name: {
      en: 'Next match in (days)',
      fr: 'Prochain match dans (jours)',
      de: 'Nächstes Spiel in (Tagen)',
      es: 'Próximo partido en (días)',
    },
  },
];

export function teamIds(gladys, teamId) {
  return gladys.externalIds(DEVICE_TYPE, teamId);
}

export function deviceExternalId(gladys, teamId) {
  return teamIds(gladys, teamId).device;
}

export function featureExternalId(gladys, teamId, key) {
  return teamIds(gladys, teamId).feature(key);
}

/**
 * The team id of one of this integration's device external ids, or null.
 * @param {object} gladys
 * @param {string} externalId
 */
export function teamIdOf(gladys, externalId) {
  const prefix = deviceExternalId(gladys, '');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

/**
 * The discovery payload of one followed team.
 * @param {object} gladys
 * @param {{ teamId: string }} ref the parsed team address
 * @param {object|null} team the team read from ffhandball.fr, when it was
 * @param {object} config
 */
export function buildDevice(gladys, ref, team, config) {
  const ids = teamIds(gladys, ref.teamId);
  const name = team ? `FFHandball – ${team.name}` : `FFHandball – ${ref.teamId}`;
  return {
    name,
    external_id: ids.device,
    // Read from ffhandball.fr on the integration's own clock (see
    // src/watcher.js): Gladys has nothing to poll.
    should_poll: false,
    params: [{ name: 'url', value: ref.url }],
    features: FEATURE_DEFINITIONS.map((definition) => ({
      name: pick(config.language, definition.name),
      external_id: ids.feature(definition.key),
      category: definition.category,
      type: definition.type,
      ...(definition.unit ? { unit: definition.unit } : {}),
      min: definition.min,
      max: definition.max,
      read_only: true,
      has_feedback: false,
      keep_history: definition.category !== DEVICE_FEATURE_CATEGORIES.TEXT,
    })),
  };
}

/**
 * The states of one team, in the `publishStates` format. A value nobody knows
 * yet (no match played, no standings) is left out rather than published as 0.
 */
export function buildStates(gladys, team, config, now = new Date()) {
  const ids = teamIds(gladys, team.id);
  const states = [];
  const number = (key, value) => {
    if (value !== null && value !== undefined) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };
  const text = (key, value) => {
    states.push({ device_feature_external_id: ids.feature(key), text: value });
  };

  const { standing } = team;
  if (standing) {
    number(FEATURES.RANK, standing.rank);
    number(FEATURES.POINTS, standing.points);
    number(FEATURES.PLAYED, standing.played);
    number(FEATURES.WON, standing.won);
    number(FEATURES.DRAWN, standing.drawn);
    number(FEATURES.LOST, standing.lost);
    number(FEATURES.GOAL_DIFFERENCE, standing.goalDifference);
  }

  const last = lastMatch(team);
  if (last) {
    number(FEATURES.LAST_RESULT, RESULT_VALUES[last.result]);
    number(FEATURES.LAST_SCORE_FOR, last.scoreFor);
    number(FEATURES.LAST_SCORE_AGAINST, last.scoreAgainst);
    text(FEATURES.LAST_MATCH, resultSentence(last, config.language));
  }

  const next = nextMatch(team, now);
  if (next) {
    text(FEATURES.NEXT_MATCH, nextMatchSentence(next, config.language));
    number(FEATURES.NEXT_MATCH_DAYS, Math.max(0, daysUntil(next.date, now)));
  } else {
    text(
      FEATURES.NEXT_MATCH,
      pick(config.language, {
        en: 'No match scheduled',
        fr: 'Aucun match programmé',
        de: 'Kein Spiel angesetzt',
        es: 'Ningún partido programado',
      }),
    );
  }
  return states;
}
