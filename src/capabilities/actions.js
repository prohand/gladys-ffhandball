// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   - `test_connection` reads every followed team again and says, team by
//     team, what ffhandball.fr answered: the fastest way to check an address;
//   - `list_teams` turns the address of a competition into the addresses of
//     its teams, ready to paste: the site shows team pages, but finding the
//     one of your club means clicking through the calendar.
//
// The resolved text is shown under the button, in the reader's language.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';
import { parseCompetitionUrl } from '../config.js';
import { formatKickoff, rankSentence } from '../ffhandball/format.js';
import { nextMatch } from '../ffhandball/team.js';

export const ACTION_KEYS = { TEST_CONNECTION: 'test_connection', LIST_TEAMS: 'list_teams' };

// What the Configuration screen shows under a button stays readable: a
// competition of 60 teams is cut, with the count of the others.
const MAX_LISTED_TEAMS = 40;

export const ACTIONS = {
  async [ACTION_KEYS.TEST_CONNECTION](watcher) {
    if (watcher.list().length === 0) {
      return localize((language) =>
        [
          pick(language, {
            en: 'No team followed yet. Paste the address of a team page of ffhandball.fr in the Teams field, then save.',
            fr: "Aucune équipe suivie. Collez l'adresse d'une page équipe de ffhandball.fr dans le champ Équipes, puis enregistrez.",
            de: 'Noch keine Mannschaft. Füge die Adresse einer Mannschaftsseite von ffhandball.fr in das Feld Mannschaften ein und speichere.',
            es: 'Aún no sigue ningún equipo. Pegue la dirección de una página de equipo de ffhandball.fr en el campo Equipos y guarde.',
          }),
          ...invalidLines(watcher, language),
        ].join('\n'),
      );
    }
    await watcher.refreshAll();
    return localize((language) =>
      [
        ...watcher.list().map((entry) => {
          if (entry.error || !entry.team) {
            return `✗ ${entry.ref.url}\n   ${entry.error?.message ?? '?'}`;
          }
          const { team } = entry;
          const next = nextMatch(team, watcher.now());
          const nextText = next
            ? `${pick(language, { en: 'next', fr: 'prochain', de: 'nächstes', es: 'próximo' })}: ${formatKickoff(next.date, language)} – ${next.opponent}`
            : pick(language, {
                en: 'no match scheduled',
                fr: 'aucun match programmé',
                de: 'kein Spiel angesetzt',
                es: 'ningún partido programado',
              });
          return (
            `✓ ${team.name} (${team.competition})\n` +
            `   ${rankSentence(team.standing, language)} · ${nextText}`
          );
        }),
        ...invalidLines(watcher, language),
      ].join('\n'),
    );
  },

  async [ACTION_KEYS.LIST_TEAMS](watcher, { fields }) {
    const ref = parseCompetitionUrl(fields.url);
    if (!ref) {
      return {
        en: 'Not a competition page of ffhandball.fr: open the competition on www.ffhandball.fr/competitions and copy the address from the browser.',
        fr: "Ce n'est pas une page de compétition de ffhandball.fr : ouvrez la compétition sur www.ffhandball.fr/competitions et copiez l'adresse du navigateur.",
        de: 'Keine Wettbewerbsseite von ffhandball.fr: öffne den Wettbewerb auf www.ffhandball.fr/competitions und kopiere die Adresse aus dem Browser.',
        es: 'No es una página de competición de ffhandball.fr: abra la competición en www.ffhandball.fr/competitions y copie la dirección del navegador.',
      };
    }
    const pools = await watcher.client.listTeams(ref);
    const total = pools.reduce((sum, pool) => sum + pool.teams.length, 0);
    let listed = 0;
    const lines = [];
    for (const pool of pools) {
      if (pools.length > 1 && pool.pool) {
        lines.push(`— ${pool.pool}`);
      }
      for (const team of pool.teams) {
        if (listed >= MAX_LISTED_TEAMS) {
          break;
        }
        lines.push(`${team.name}\n${team.url}`);
        listed += 1;
      }
    }
    return localize((language) => {
      if (total === 0) {
        return pick(language, {
          en: 'No team in this competition yet.',
          fr: "Aucune équipe dans cette compétition pour l'instant.",
          de: 'Noch keine Mannschaft in diesem Wettbewerb.',
          es: 'Aún no hay equipos en esta competición.',
        });
      }
      const intro = pick(language, {
        en: 'Copy the address of your team into the Teams field:',
        fr: "Copiez l'adresse de votre équipe dans le champ Équipes :",
        de: 'Kopiere die Adresse deiner Mannschaft in das Feld Mannschaften:',
        es: 'Copie la dirección de su equipo en el campo Equipos:',
      });
      const more =
        total > listed
          ? `\n… ${pick(language, {
              en: `and ${total - listed} more: give the address of one pool to see it.`,
              fr: `et ${total - listed} autres : donnez l'adresse d'une poule pour la voir.`,
              de: `und ${total - listed} weitere: gib die Adresse einer Gruppe an, um sie zu sehen.`,
              es: `y ${total - listed} más: indique la dirección de un grupo para verlo.`,
            })}`
          : '';
      return `${intro}\n${lines.join('\n')}${more}`;
    });
  },
};

function invalidLines(watcher, language) {
  return watcher.invalid.map(
    (entry) =>
      `✗ ${entry}\n   ${pick(language, {
        en: 'not a team page of ffhandball.fr (…/equipe-<number>/)',
        fr: 'pas une page équipe de ffhandball.fr (…/equipe-<numéro>/)',
        de: 'keine Mannschaftsseite von ffhandball.fr (…/equipe-<Nummer>/)',
        es: 'no es una página de equipo de ffhandball.fr (…/equipe-<número>/)',
      })}`,
  );
}
