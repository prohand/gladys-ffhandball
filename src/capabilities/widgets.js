// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// Four cards, all built from what src/watcher.js holds in memory (a widget
// never reads ffhandball.fr itself: a dashboard open on a wall would load the
// site at every content pull):
//   - `team`: one team at a glance — rank, points and goal difference as live
//     tiles bound to its device, the last result and the next match;
//   - `standings`: the table of its pool, around the team;
//   - `fixtures`: the next matches of every followed team;
//   - `results`: their last results.
//
// Every text is a multi-language object or fits the vocabulary's limits as is:
// test/widgets.test.js checks each content with `validateWidgetContent`.
// Keys are stored in the users' dashboards: never rename one.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { languageOf, localize, pick } from '../i18n.js';
import { formatKickoff, matchTitle, RESULT_LABELS, VENUE_LABELS } from '../ffhandball/format.js';
import { lastMatch, nextMatch, RESULTS, upcomingMatches } from '../ffhandball/team.js';
import { deviceExternalId, featureExternalId, FEATURES } from '../devices/team.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  TEAM: 'team',
  STANDINGS: 'standings',
  FIXTURES: 'fixtures',
  RESULTS: 'results',
};

export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

const RESULT_COLORS = {
  [RESULTS.WIN]: WIDGET_COLORS.SUCCESS,
  [RESULTS.DRAW]: WIDGET_COLORS.NEUTRAL,
  [RESULTS.LOSS]: WIDGET_COLORS.DANGER,
};

/** Cut a text to the length a component accepts, with an ellipsis. */
export function fit(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** The count a widget setting asks for, within its bounds. */
function countOf(settings, fallback, max) {
  const count = Number(settings?.count);
  return Number.isFinite(count) && count >= 1 ? Math.min(max, Math.round(count)) : fallback;
}

/** The team a widget instance shows: the chosen device, or the first team. */
function teamOf(watcher, settings) {
  const teams = watcher.teams();
  if (settings?.device) {
    return (
      teams.find((team) => deviceExternalId(watcher.gladys, team.id) === settings.device) ?? null
    );
  }
  return teams[0] ?? null;
}

const NO_TEAM = {
  type: 'text',
  text: {
    en: 'No team read yet: check the integration configuration.',
    fr: "Aucune équipe lue pour l'instant : vérifiez la configuration de l'intégration.",
    de: 'Noch keine Mannschaft gelesen: prüfe die Konfiguration der Integration.',
    es: 'Aún no se ha leído ningún equipo: revise la configuración de la integración.',
  },
};

const REFRESH_BUTTON = {
  type: 'button',
  label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: WIDGET_ACTIONS.REFRESH },
};

// The core caches a content until its TTL, and src/watcher.js nudges every
// widget after each refresh: the TTL only covers what moves with the clock
// (a match that became "today").
const TTL_SECONDS = 15 * 60;

function teamContent(watcher, { settings }) {
  const team = teamOf(watcher, settings);
  if (!team) {
    return { ttl_seconds: TTL_SECONDS, components: [NO_TEAM, REFRESH_BUTTON] };
  }
  const id = (key) => featureExternalId(watcher.gladys, team.id, key);
  const last = lastMatch(team);
  const next = nextMatch(team, watcher.now());
  const items = [];
  if (last) {
    items.push({
      label: localize(
        (language) =>
          `${pick(language, { en: 'Last', fr: 'Dernier', de: 'Letztes', es: 'Último' })} · ${fit(last.opponent, 28)}`,
      ),
      icon: 'flag',
      value: localize(
        (language) =>
          `${pick(language, RESULT_LABELS[last.result])} ${last.scoreFor}-${last.scoreAgainst}`,
      ),
      color: RESULT_COLORS[last.result],
    });
  }
  if (next) {
    items.push({
      label: localize(
        (language) =>
          `${pick(language, { en: 'Next', fr: 'Prochain', de: 'Nächstes', es: 'Próximo' })} · ${fit(next.opponent, 28)}`,
      ),
      icon: 'calendar',
      value: localize((language) =>
        fit(
          `${formatKickoff(next.date, language)} (${pick(language, VENUE_LABELS[next.venue])})`,
          40,
        ),
      ),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      { type: 'text', variant: 'heading', text: fit(team.name, 40) },
      { type: 'text', variant: 'caption', text: fit(team.competition, 80) },
      // Live tiles: they follow the states of the team's device.
      {
        type: 'value',
        label: { en: 'Rank', fr: 'Classement', de: 'Platz', es: 'Posición' },
        icon: 'award',
        device_feature: id(FEATURES.RANK),
      },
      {
        type: 'value',
        label: { en: 'Points', fr: 'Points', de: 'Punkte', es: 'Puntos' },
        icon: 'star',
        device_feature: id(FEATURES.POINTS),
      },
      {
        type: 'value',
        label: { en: 'Goal diff.', fr: 'Diff. de buts', de: 'Tordiff.', es: 'Dif. goles' },
        icon: 'trending-up',
        device_feature: id(FEATURES.GOAL_DIFFERENCE),
      },
      ...(items.length > 0 ? [{ type: 'status', items }] : []),
      {
        type: 'button',
        label: {
          en: 'ffhandball.fr',
          fr: 'ffhandball.fr',
          de: 'ffhandball.fr',
          es: 'ffhandball.fr',
        },
        icon: 'external-link',
        style: 'secondary',
        link: { url: team.url },
      },
      REFRESH_BUTTON,
    ],
  };
}

function standingsContent(watcher, { settings }) {
  const team = teamOf(watcher, settings);
  if (!team || team.standings.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [NO_TEAM] };
  }
  // At most ten rows (a `status` list holds ten): the window around the team.
  const size = countOf(settings, 10, 10);
  const index = Math.max(
    0,
    team.standings.findIndex((row) => row.followed),
  );
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), team.standings.length - size));
  const rows = team.standings.slice(start, start + size);
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      { type: 'text', variant: 'heading', text: fit(team.competition || team.name, 40) },
      {
        type: 'status',
        items: rows.map((row) => ({
          label: fit(`${row.rank}. ${row.team}`, 40),
          value: `${row.points ?? 0} pts`,
          icon: row.followed ? 'star' : 'shield',
          color: row.followed ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
        })),
      },
      {
        type: 'button',
        label: {
          en: 'Full standings',
          fr: 'Classement complet',
          de: 'Ganze Tabelle',
          es: 'Clasificación',
        },
        icon: 'external-link',
        style: 'secondary',
        link: { url: team.url },
      },
    ],
  };
}

function matchItem(team, match, badge, language) {
  return {
    title: fit(matchTitle(match), 60),
    subtitle: fit(`${team.name} · ${team.competition}`, 60),
    ...(match.date ? { date: match.date.toISOString() } : {}),
    badge,
    links: [{ url: team.url, label: 'ffhandball.fr' }],
    description: fit(
      `${formatKickoff(match.date, language)} · ${pick(language, VENUE_LABELS[match.venue])}`,
      2000,
    ),
  };
}

function fixturesContent(watcher, { settings, language }) {
  const now = watcher.now();
  const count = countOf(settings, 5, 8);
  const lang = languageOf(language);
  const matches = watcher
    .teams()
    .flatMap((team) => upcomingMatches(team, now).map((match) => ({ team, match })))
    .sort((a, b) => a.match.date - b.match.date)
    .slice(0, count);
  if (matches.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        {
          type: 'text',
          text: {
            en: 'No match scheduled.',
            fr: 'Aucun match programmé.',
            de: 'Kein Spiel angesetzt.',
            es: 'Ningún partido programado.',
          },
        },
      ],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: matches.map(({ team, match }) =>
          matchItem(
            team,
            match,
            {
              text: fit(pick(lang, VENUE_LABELS[match.venue]), 16),
              color: WIDGET_COLORS.PRIMARY,
            },
            lang,
          ),
        ),
      },
    ],
  };
}

function resultsContent(watcher, { settings, language }) {
  const count = countOf(settings, 5, 8);
  const lang = languageOf(language);
  const matches = watcher
    .teams()
    .flatMap((team) => team.matches.filter((m) => m.played).map((match) => ({ team, match })))
    .sort((a, b) => (b.match.date ?? 0) - (a.match.date ?? 0))
    .slice(0, count);
  if (matches.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        {
          type: 'text',
          text: {
            en: 'No result yet.',
            fr: 'Aucun résultat pour l’instant.',
            de: 'Noch kein Ergebnis.',
            es: 'Aún no hay resultados.',
          },
        },
      ],
    };
  }
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: matches.map(({ team, match }) =>
          matchItem(
            team,
            match,
            {
              text: fit(
                `${pick(lang, RESULT_LABELS[match.result])} ${match.scoreFor}-${match.scoreAgainst}`,
                16,
              ),
              color: RESULT_COLORS[match.result],
            },
            lang,
          ),
        ),
      },
    ],
  };
}

async function refreshAction(watcher) {
  const { ok, failed } = await watcher.refreshAll();
  if (failed > 0 && ok === 0) {
    throw new Error('ffhandball.fr could not be read, see the integration logs');
  }
  return localize(
    (language) =>
      `${pick(language, {
        en: 'Teams refreshed',
        fr: 'Équipes actualisées',
        de: 'Mannschaften aktualisiert',
        es: 'Equipos actualizados',
      })}: ${ok}/${ok + failed}`,
  );
}

/**
 * The widgets, keyed by their manifest `key`: `get(watcher, request)` builds
 * the content, `action(watcher, { actionKey })` answers a tapped button.
 */
export const WIDGETS = {
  [WIDGET_KEYS.TEAM]: {
    get: async (watcher, request) => teamContent(watcher, request),
    action: async (watcher, { actionKey }) => {
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        return refreshAction(watcher);
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
  [WIDGET_KEYS.STANDINGS]: {
    get: async (watcher, request) => standingsContent(watcher, request),
  },
  [WIDGET_KEYS.FIXTURES]: {
    get: async (watcher, request) => fixturesContent(watcher, request),
  },
  [WIDGET_KEYS.RESULTS]: {
    get: async (watcher, request) => resultsContent(watcher, request),
  },
};

/** Ask the core to pull every widget again, after a refresh. */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
  logger.debug('Widgets nudged');
}
