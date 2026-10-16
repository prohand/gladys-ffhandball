// -----------------------------------------------------------------------------
// From the raw blocks of ffhandball.fr to one followed team.
//
// The site speaks of "equipe1" (home) and "equipe2" (away), with numbers as
// strings and `null` for what is not known yet (a score before the match, the
// date of a match not scheduled yet). Everything below is written from the
// followed team's side: its opponent, its goals, its result.
// -----------------------------------------------------------------------------

export const RESULTS = { WIN: 'win', DRAW: 'draw', LOSS: 'loss' };
export const VENUES = { HOME: 'home', AWAY: 'away' };

// The numeric value of a result, published on the `last_result` feature: a
// scene condition can compare it, a text cannot.
export const RESULT_VALUES = { [RESULTS.WIN]: 1, [RESULTS.DRAW]: 0, [RESULTS.LOSS]: -1 };

const toInt = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
};

const toDate = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * The competition as the site names it. A pool named after the competition
 * ("DAIKIN STARLIGUE 2026-27", its phase being "SAISON REGULIERE") is the
 * name; a numbered pool ("POULE 2") reads after its phase.
 */
function competitionLabel(pool) {
  const selected = pool?.selected_poule;
  const phase = (pool?.phases ?? []).find((p) => p.id === selected?.phaseId) ?? pool?.phases?.[0];
  const phaseName = phase?.libelle?.trim();
  const poolName = selected?.libelle?.trim();
  if (poolName && !/^poule\b/i.test(poolName)) {
    return poolName;
  }
  if (phaseName && poolName) {
    return `${phaseName} – ${poolName}`;
  }
  return phaseName || poolName || '';
}

/**
 * One match, from the followed team's side.
 * @param {object} raw a `rencontres` entry
 * @param {string} internalId the team's id in the site's own tables
 */
export function toMatch(raw, internalId) {
  const home = String(raw.equipe1Id) === String(internalId);
  const scoreFor = toInt(home ? raw.equipe1Score : raw.equipe2Score);
  const scoreAgainst = toInt(home ? raw.equipe2Score : raw.equipe1Score);
  const played = scoreFor !== null && scoreAgainst !== null;
  let result = null;
  if (played) {
    result =
      scoreFor > scoreAgainst ? RESULTS.WIN : scoreFor < scoreAgainst ? RESULTS.LOSS : RESULTS.DRAW;
  }
  return {
    id: String(raw.ext_rencontreId ?? raw.id),
    date: toDate(raw.date),
    round: toInt(raw.journeeNumero),
    phase: raw.phaseLibelle ?? null,
    venue: home ? VENUES.HOME : VENUES.AWAY,
    homeTeam: raw.equipe1Libelle ?? '',
    awayTeam: raw.equipe2Libelle ?? '',
    opponent: (home ? raw.equipe2Libelle : raw.equipe1Libelle) ?? '',
    homeScore: toInt(raw.equipe1Score),
    awayScore: toInt(raw.equipe2Score),
    scoreFor,
    scoreAgainst,
    played,
    result,
  };
}

/** One row of the standings. */
function toStanding(raw, internalId) {
  return {
    rank: toInt(raw.place),
    team: raw.equipe_libelle ?? '',
    points: toInt(raw.point),
    played: toInt(raw.joue),
    won: toInt(raw.gagne),
    drawn: toInt(raw.nul),
    lost: toInt(raw.perdu),
    goalsFor: toInt(raw.butPlus),
    goalsAgainst: toInt(raw.butMoins),
    goalDifference: toInt(raw.diff),
    followed: String(raw.equipeId) === String(internalId),
  };
}

/**
 * The followed team, built from the three blocks {@link FfhbClient.fetchTeam}
 * reads.
 * @param {{ teamId: string, url: string }} ref the parsed team address
 * @param {{ pool: object, matches: object, standings: object }} blocks
 */
export function buildTeam(ref, { pool, matches, standings }) {
  const selected = pool?.selected_equipe;
  if (!selected) {
    throw new Error(
      `team ${ref.teamId} not found on ffhandball.fr (season over or wrong address?)`,
    );
  }
  const internalId = String(selected.id);
  const allMatches = (matches?.rencontres ?? [])
    .map((raw) => toMatch(raw, internalId))
    // Matches without a date (not scheduled yet) go last, in round order.
    .sort((a, b) => {
      if (a.date && b.date) {
        return a.date - b.date;
      }
      if (a.date || b.date) {
        return a.date ? -1 : 1;
      }
      return (a.round ?? 0) - (b.round ?? 0);
    });
  const table = (standings?.classements ?? [])
    .map((raw) => toStanding(raw, internalId))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  return {
    id: ref.teamId,
    url: ref.url,
    name: selected.libelle?.trim() || `Team ${ref.teamId}`,
    competition: competitionLabel(pool),
    matches: allMatches,
    standings: table,
    standing: table.find((row) => row.followed) ?? null,
  };
}

/** The last match played, or null. */
export function lastMatch(team) {
  return team.matches.filter((match) => match.played).at(-1) ?? null;
}

// A match is still "next" for a while after its kick-off, until its score is
// known: a handball match lasts about an hour and a half.
const STILL_NEXT_MS = 3 * 60 * 60 * 1000;

/** The next match to play (scheduled, not played yet), or null. */
export function nextMatch(team, now = new Date()) {
  return (
    team.matches.find(
      (match) => !match.played && match.date && match.date.getTime() + STILL_NEXT_MS > now,
    ) ?? null
  );
}

/** The scheduled matches still to play, soonest first. */
export function upcomingMatches(team, now = new Date()) {
  return team.matches.filter(
    (match) => !match.played && match.date && match.date.getTime() + STILL_NEXT_MS > now,
  );
}
