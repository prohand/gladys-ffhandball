import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeConfig,
  parseCompetitionUrl,
  parseTeams,
  parseTeamUrl,
} from '../src/config.js';

const PSG =
  'https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/';

test('a team page gives the four parameters of the site', () => {
  assert.deepEqual(parseTeamUrl(PSG), {
    seasonId: '22',
    type: 'national',
    competition: 'daikin-starligue-2026-27-32372',
    teamId: '2119699',
    url: PSG,
  });
});

test('a team page copied from a sub-page or without its scheme still reads', () => {
  const ref = parseTeamUrl(
    'www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/equipe-2119699/statistiques/',
  );
  assert.equal(ref.teamId, '2119699');
  // The address kept is the canonical one, whatever was pasted.
  assert.equal(ref.url, PSG);
});

test('a page that is not a team page is not a team', () => {
  assert.equal(parseTeamUrl('https://www.ffhandball.fr/competitions/'), null);
  assert.equal(
    parseTeamUrl(
      'https://www.ffhandball.fr/competitions/saison-2026-2027-22/national/daikin-starligue-2026-27-32372/',
    ),
    null,
  );
  assert.equal(parseTeamUrl(undefined), null);
});

test('the teams field takes one address per line, reports the others, keeps each team once', () => {
  const other =
    'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/nationale-3-feminine-aura-30494/equipe-2117121/';
  const { teams, invalid } = parseTeams(`${PSG}\n\n  ${other} , ${PSG}\nhello`);
  assert.deepEqual(
    teams.map((team) => team.teamId),
    ['2119699', '2117121'],
  );
  assert.deepEqual(invalid, ['hello']);
  assert.deepEqual(parseTeams(''), { teams: [], invalid: [] });
});

test('a competition page, a pool page or a team page is a competition', () => {
  assert.deepEqual(
    parseCompetitionUrl(
      'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/nationale-3-feminine-aura-30494/',
    ),
    {
      seasonId: '22',
      type: 'regional',
      competition: 'nationale-3-feminine-aura-30494',
      poolId: null,
    },
  );
  assert.equal(
    parseCompetitionUrl(
      'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/nationale-3-feminine-aura-30494/poule-190150/',
    ).poolId,
    '190150',
  );
  assert.equal(parseCompetitionUrl(PSG).competition, 'daikin-starligue-2026-27-32372');
  // A structure page (the list of a league's competitions) is not one.
  assert.equal(
    parseCompetitionUrl(
      'https://www.ffhandball.fr/competitions/saison-2026-2027-22/regional/o-5100000-4/',
    ),
    null,
  );
});

test('normalizeConfig applies the defaults and keeps the numbers in range', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  const config = normalizeConfig({
    refresh_minutes: '1',
    reminder_minutes: '90',
    language: 'it',
  });
  assert.equal(config.refresh_minutes, 5);
  assert.equal(config.reminder_minutes, 90);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ refresh_minutes: 'abc' }).refresh_minutes, 30);
  assert.equal(normalizeConfig({ reminder_minutes: 0 }).reminder_minutes, 0);
  assert.equal(normalizeConfig({ teams: null }).teams, '');
});
