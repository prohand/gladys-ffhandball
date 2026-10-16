// -----------------------------------------------------------------------------
// How matches read, in each language.
//
// Times are French times: ffhandball.fr dates every match with its Paris offset,
// and that is the hour printed on the tickets. The texts stay short — they end
// up in a dashboard tile, a notification or a spoken message.
// -----------------------------------------------------------------------------

import { pick } from '../i18n.js';
import { RESULTS, VENUES } from './team.js';

export const TIME_ZONE = 'Europe/Paris';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const formatters = new Map();
function formatter(language, options) {
  const key = `${language}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.en, { timeZone: TIME_ZONE, ...options }),
    );
  }
  return formatters.get(key);
}

/** "sam. 17/10 19:00", "Sat 17/10, 19:00"… or a "date to be set" text. */
export function formatKickoff(date, language) {
  if (!date) {
    return pick(language, {
      en: 'date to be set',
      fr: 'date à fixer',
      de: 'Termin offen',
      es: 'fecha por fijar',
    });
  }
  return formatter(language, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** The calendar date of an instant in French time, `YYYY-MM-DD`. */
function calendarDay(date) {
  return formatter('en', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date)
    .reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
}

/** Whole days between today and the day of the match (0 on match day). */
export function daysUntil(date, now = new Date()) {
  const a = calendarDay(now);
  const b = calendarDay(date);
  const utc = (p) => Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** "CAEN HANDBALL – PARIS SAINT-GERMAIN", with the score once played. */
export function matchTitle(match) {
  if (match.played) {
    return `${match.homeTeam} ${match.homeScore} – ${match.awayScore} ${match.awayTeam}`;
  }
  return `${match.homeTeam} – ${match.awayTeam}`;
}

export const RESULT_LABELS = {
  [RESULTS.WIN]: { en: 'Win', fr: 'Victoire', de: 'Sieg', es: 'Victoria' },
  [RESULTS.DRAW]: { en: 'Draw', fr: 'Nul', de: 'Unentschieden', es: 'Empate' },
  [RESULTS.LOSS]: { en: 'Loss', fr: 'Défaite', de: 'Niederlage', es: 'Derrota' },
};

export const VENUE_LABELS = {
  [VENUES.HOME]: { en: 'Home', fr: 'Domicile', de: 'Heim', es: 'Local' },
  [VENUES.AWAY]: { en: 'Away', fr: 'Extérieur', de: 'Auswärts', es: 'Visitante' },
};

/** "Victoire 32-29 contre CHAMBERY SAVOIE MB" */
export function resultSentence(match, language) {
  const against = pick(language, { en: 'against', fr: 'contre', de: 'gegen', es: 'contra' });
  return (
    `${pick(language, RESULT_LABELS[match.result])} ${match.scoreFor}-${match.scoreAgainst} ` +
    `${against} ${match.opponent}`
  );
}

/** "sam. 17/10 19:00 · CAEN HANDBALL – PARIS SAINT-GERMAIN" */
export function nextMatchSentence(match, language) {
  return `${formatKickoff(match.date, language)} · ${matchTitle(match)}`;
}

/** "1er · 12 pts", "1st · 12 pts"… */
export function rankSentence(standing, language) {
  if (!standing || standing.rank === null) {
    return '—';
  }
  const rank = pick(language, {
    en: `#${standing.rank}`,
    fr: standing.rank === 1 ? '1er' : `${standing.rank}e`,
    de: `${standing.rank}.`,
    es: `${standing.rank}.º`,
  });
  return `${rank} · ${standing.points ?? 0} pts`;
}
