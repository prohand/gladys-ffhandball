// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults,
// normalizes the received object (form values may arrive as strings) and reads
// the followed teams out of the pasted ffhandball.fr addresses.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // ffhandball.fr team pages, one per line.
  teams: '',
  // Minutes between two reads of ffhandball.fr. The site itself caches its
  // pages for an hour: reading it every minute would only load it for nothing.
  refresh_minutes: 30,
  // How long before kick-off the "A match is about to start" trigger fires.
  reminder_minutes: 60,
  // Language of the device names and of the texts published as states (the
  // widgets and messages follow the reader's own language).
  language: 'fr',
};

export const REFRESH_MINUTES = { min: 5, max: 1440 };
export const REMINDER_MINUTES = { min: 0, max: 1440 };

// A team page of ffhandball.fr:
//   https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/
// The season id, the competition type and slug, and the team id are the four
// parameters the site's own data service asks for.
const TEAM_URL =
  /\/competitions\/saison-\d{4}-\d{4}-(\d+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/equipe-(\d+)/i;

// A competition (or pool) page, the input of the "List the teams" action.
const COMPETITION_URL =
  /\/competitions\/saison-\d{4}-\d{4}-(\d+)\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/poule-(\d+))?/i;

/**
 * The team a ffhandball.fr address points at, or null.
 * @param {string} url
 * @returns {{ seasonId: string, type: string, competition: string, teamId: string, url: string } | null}
 */
export function parseTeamUrl(url) {
  const match = String(url ?? '').match(TEAM_URL);
  if (!match) {
    return null;
  }
  const [, seasonId, type, competition, teamId] = match;
  const season = Number(seasonId) + 2004;
  return {
    seasonId,
    type: type.toLowerCase(),
    competition: competition.toLowerCase(),
    teamId,
    url:
      `https://www.ffhandball.fr/competitions/saison-${season}-${season + 1}-${seasonId}/` +
      `${type.toLowerCase()}/${competition.toLowerCase()}/equipe-${teamId}/`,
  };
}

/**
 * The competition a ffhandball.fr address points at, or null. A team page is
 * a competition page too: its teams are the ones it plays against.
 * @param {string} url
 */
export function parseCompetitionUrl(url) {
  const match = String(url ?? '').match(COMPETITION_URL);
  if (!match || /^o-/.test(match[3])) {
    return null;
  }
  const [, seasonId, type, competition, poolId] = match;
  return {
    seasonId,
    type: type.toLowerCase(),
    competition: competition.toLowerCase(),
    poolId: poolId ?? null,
  };
}

/**
 * Read the followed teams out of the `teams` field: one address per line (a
 * comma, a semicolon or spaces work too). An address that is not a team page
 * is reported, never silently dropped.
 * @param {string} text
 * @returns {{ teams: ReturnType<typeof parseTeamUrl>[], invalid: string[] }}
 */
export function parseTeams(text) {
  const teams = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of String(text ?? '').split(/[\s,;]+/)) {
    if (!entry) {
      continue;
    }
    const team = parseTeamUrl(entry);
    if (!team) {
      invalid.push(entry);
    } else if (!seen.has(team.teamId)) {
      seen.add(team.teamId);
      teams.push(team);
    }
  }
  return { teams, invalid };
}

function clamp(value, { min, max }, fallback) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...raw };
  return {
    ...config,
    teams: String(config.teams ?? ''),
    refresh_minutes: clamp(raw.refresh_minutes, REFRESH_MINUTES, DEFAULT_CONFIG.refresh_minutes),
    reminder_minutes: clamp(
      raw.reminder_minutes,
      REMINDER_MINUTES,
      DEFAULT_CONFIG.reminder_minutes,
    ),
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}
