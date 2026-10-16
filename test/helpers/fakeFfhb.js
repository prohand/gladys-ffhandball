// -----------------------------------------------------------------------------
// A fake ffhandball.fr, for the tests: no network.
//
// It serves what the real site serves — a page carrying the `data-cfk` key,
// and the `computeBlockAttributes` route answering obfuscated blocks — from a
// small season the tests edit between two refreshes (a score that appears, a
// match moved, a rank that changes).
// -----------------------------------------------------------------------------

import { BLOCKS, encodePayload } from '../../src/ffhandball/client.js';

export const KEY = 'testKey0123456789';

export const TEAM_URL =
  'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/prenationale-masculine-test-30500/equipe-2001/';
export const COMPETITION_URL =
  'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/prenationale-masculine-test-30500/';

// The site's internal ids (equipe1Id / equipe2Id / equipeId) and the public
// ones (ext_equipeId, in the page addresses) are different numbers.
export const TEAMS = {
  followed: { id: '100', ext: '2001', name: 'HBC TEST' },
  a: { id: '101', ext: '2002', name: 'RIVAL A' },
  b: { id: '102', ext: '2003', name: 'RIVAL B' },
  c: { id: '103', ext: '2004', name: 'RIVAL C' },
};

const team = (key) => TEAMS[key];

function match(id, round, date, home, away, homeScore = null, awayScore = null) {
  return {
    id: `9${id}`,
    ext_rencontreId: id,
    pouleId: '500',
    equipe1Id: team(home).id,
    equipe2Id: team(away).id,
    equipe1Score: homeScore === null ? null : String(homeScore),
    equipe2Score: awayScore === null ? null : String(awayScore),
    date,
    journeeNumero: String(round),
    equipe1Libelle: team(home).name,
    equipe2Libelle: team(away).name,
    phaseLibelle: 'PRENATIONALE MASCULINE TEST',
    extPouleId: '600',
  };
}

function standing(key, place, point, joue, gagne, nul, perdu, diff) {
  return {
    equipeId: team(key).id,
    place: String(place),
    point: String(point),
    joue: String(joue),
    gagne: String(gagne),
    nul: String(nul),
    perdu: String(perdu),
    butPlus: '60',
    butMoins: String(60 - diff),
    diff: String(diff),
    equipe_libelle: team(key).name,
  };
}

/** A season in progress: one win, one draw, the next match tomorrow. */
export function createSeason() {
  return {
    matches: [
      match('1', 1, '2026-10-03T18:00:00+02:00', 'followed', 'a', 30, 25),
      match('2', 2, '2026-10-10T20:00:00+02:00', 'b', 'followed', 28, 28),
      match('3', 3, '2026-10-17T19:00:00+02:00', 'followed', 'c'),
      match('4', 4, null, 'a', 'followed'),
    ],
    standings: [
      standing('a', 1, 7, 2, 2, 0, 0, 9),
      standing('followed', 2, 5, 2, 1, 1, 0, 5),
      standing('b', 3, 4, 2, 1, 1, 0, 2),
      standing('c', 4, 2, 2, 0, 0, 2, -16),
    ],
  };
}

/** Give a match its final score, as the site does after the match sheet. */
export function setScore(season, id, homeScore, awayScore) {
  const found = season.matches.find((m) => m.ext_rencontreId === id);
  found.equipe1Score = String(homeScore);
  found.equipe2Score = String(awayScore);
}

export function setDate(season, id, date) {
  season.matches.find((m) => m.ext_rencontreId === id).date = date;
}

export function setRank(season, key, place) {
  season.standings.find((row) => row.equipeId === team(key).id).place = String(place);
}

function poolBlock(params) {
  const options = Object.values(TEAMS).map((t) => ({
    id: t.id,
    ext_equipeId: t.ext,
    pouleId: '500',
    libelle: t.name,
  }));
  const selected = params.ext_equipe_id
    ? options.find((t) => t.ext_equipeId === params.ext_equipe_id)
    : null;
  return {
    selected_equipe: params.ext_equipe_id ? (selected ?? null) : null,
    selected_poule:
      params.ext_poule_id === '601'
        ? { id: '501', ext_pouleId: '601', phaseId: '700', libelle: 'POULE 2' }
        : { id: '500', ext_pouleId: '600', phaseId: '700', libelle: 'POULE 1' },
    equipe_options: params.ext_poule_id === '601' ? options.slice(0, 2) : options,
    phases: [{ id: '700', libelle: 'PRENATIONALE MASCULINE TEST' }],
    poules: [
      { id: '500', ext_pouleId: '600', libelle: 'POULE 1' },
      { id: '501', ext_pouleId: '601', libelle: 'POULE 2' },
    ],
  };
}

/**
 * A `fetch` serving the season. `server.calls` lists the requested paths,
 * `server.key` can be changed to play a key rotation, `server.down` makes
 * every request fail.
 */
export function createFakeFfhb(season = createSeason()) {
  const server = { season, key: KEY, calls: [], down: false, pageServesKey: true };
  server.fetch = async (url) => {
    const { pathname, searchParams } = new URL(url);
    server.calls.push(`${pathname}${searchParams.size ? `?${searchParams}` : ''}`);
    if (server.down) {
      throw new TypeError('fetch failed');
    }
    if (pathname === '/competitions/') {
      const body = server.pageServesKey ? `<body class="x" data-cfk="${server.key}">` : '<body>';
      return new Response(`<html>${body}</body></html>`, { status: 200 });
    }
    if (pathname === '/wp-json/competitions/v1/computeBlockAttributes') {
      const params = Object.fromEntries(searchParams);
      let data;
      if (params.block === BLOCKS.POOL) {
        data = poolBlock(params);
      } else if (params.block === BLOCKS.MATCHES) {
        data = { rencontres: server.season.matches };
      } else if (params.block === BLOCKS.STANDINGS) {
        data = { classements: server.season.standings };
      } else {
        return Response.json(
          {
            code: 'rest_invalid_param',
            message: 'Invalid parameter(s): block',
            data: { status: 400 },
          },
          { status: 400 },
        );
      }
      return Response.json(encodePayload(data, server.key));
    }
    return new Response('not found', { status: 404 });
  };
  return server;
}
