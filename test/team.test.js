import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeFfhb, TEAM_URL } from './helpers/fakeFfhb.js';
import { FfhbClient } from '../src/ffhandball/client.js';
import { parseTeamUrl } from '../src/config.js';
import {
  buildTeam,
  lastMatch,
  nextMatch,
  RESULTS,
  upcomingMatches,
  VENUES,
} from '../src/ffhandball/team.js';
import {
  daysUntil,
  formatKickoff,
  matchTitle,
  rankSentence,
  resultSentence,
} from '../src/ffhandball/format.js';
import { NOW } from './helpers/setup.js';

const ref = parseTeamUrl(TEAM_URL);

async function readTeam(site = createFakeFfhb()) {
  const client = new FfhbClient({ fetch: site.fetch });
  return buildTeam(ref, await client.fetchTeam(ref));
}

test('the team reads from its own side: opponent, goals, result, venue', async () => {
  const team = await readTeam();
  assert.equal(team.name, 'HBC TEST');
  assert.equal(team.id, '2001');
  assert.equal(team.url, TEAM_URL);
  const [first, second] = team.matches;
  assert.equal(first.venue, VENUES.HOME);
  assert.equal(first.opponent, 'RIVAL A');
  assert.equal(first.scoreFor, 30);
  assert.equal(first.scoreAgainst, 25);
  assert.equal(first.result, RESULTS.WIN);
  assert.equal(second.venue, VENUES.AWAY);
  assert.equal(second.opponent, 'RIVAL B');
  assert.equal(second.result, RESULTS.DRAW);
});

test('a numbered pool reads after its phase', async () => {
  const team = await readTeam();
  assert.equal(team.competition, 'PRENATIONALE MASCULINE TEST – POULE 1');
});

test('the matches without a date come last', async () => {
  const team = await readTeam();
  assert.deepEqual(
    team.matches.map((match) => match.id),
    ['1', '2', '3', '4'],
  );
  assert.equal(team.matches.at(-1).date, null);
});

test('last and next match, from the clock', async () => {
  const team = await readTeam();
  assert.equal(lastMatch(team).id, '2');
  assert.equal(nextMatch(team, NOW).id, '3');
  // Still "next" during the match, until its score is known.
  assert.equal(nextMatch(team, new Date('2026-10-17T18:30:00Z')).id, '3');
  assert.equal(nextMatch(team, new Date('2026-10-18T12:00:00Z')), null);
  assert.equal(upcomingMatches(team, NOW).length, 1);
});

test('the standing of the team is its own row', async () => {
  const team = await readTeam();
  assert.equal(team.standing.rank, 2);
  assert.equal(team.standing.points, 5);
  assert.equal(team.standing.goalDifference, 5);
  assert.equal(team.standings.length, 4);
  assert.equal(team.standings.filter((row) => row.followed).length, 1);
});

test('a team the site does not know is an error that says so', async () => {
  const site = createFakeFfhb();
  const client = new FfhbClient({ fetch: site.fetch });
  const unknown = parseTeamUrl(TEAM_URL.replace('equipe-2001', 'equipe-9999'));
  await assert.rejects(
    async () => buildTeam(unknown, await client.fetchTeam(unknown)),
    /not found/,
  );
});

test('the texts read in every language, in French time', async () => {
  const team = await readTeam();
  const next = nextMatch(team, NOW);
  assert.equal(formatKickoff(next.date, 'fr'), 'sam. 17/10 19:00');
  assert.match(formatKickoff(next.date, 'en'), /Sat.*17\/10.*19:00/);
  assert.equal(formatKickoff(null, 'de'), 'Termin offen');
  assert.equal(matchTitle(next), 'HBC TEST – RIVAL C');
  assert.equal(matchTitle(team.matches[0]), 'HBC TEST 30 – 25 RIVAL A');
  assert.equal(resultSentence(team.matches[0], 'fr'), 'Victoire 30-25 contre RIVAL A');
  assert.equal(resultSentence(team.matches[1], 'es'), 'Empate 28-28 contra RIVAL B');
  assert.equal(rankSentence(team.standing, 'fr'), '2e · 5 pts');
  assert.equal(rankSentence({ rank: 1, points: 7 }, 'fr'), '1er · 7 pts');
  assert.equal(rankSentence(null, 'en'), '—');
});

test('days until a match count calendar days in Paris', () => {
  const match = new Date('2026-10-17T17:00:00Z');
  assert.equal(daysUntil(match, NOW), 1);
  // 23:30 in Paris on the 16th is still the day before.
  assert.equal(daysUntil(match, new Date('2026-10-16T21:30:00Z')), 1);
  // 00:30 in Paris on the 17th is match day.
  assert.equal(daysUntil(match, new Date('2026-10-16T22:30:00Z')), 0);
});
