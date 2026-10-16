// -----------------------------------------------------------------------------
// Reading ffhandball.fr.
//
// The federation publishes no public API. Its website renders every
// competition block (calendar, standings, pools…) from a WordPress REST route,
// `wp-json/competitions/v1/computeBlockAttributes`, which takes the same
// parameters as the page address (season, competition type and slug, team,
// pool) and answers the block's data. That answer is obfuscated, not secret:
// base64, then XOR with a key the site writes in plain text on every page (the
// `data-cfk` attribute of `<body>`), and the site's own JavaScript decodes it
// the same way.
//
// So the client reads the key from a page once, keeps it, and reads it again
// only when an answer no longer decodes (the site changed its key). Nothing is
// sent but public GET requests, at the pace of the configured refresh, and the
// site caches each answer an hour anyway.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'ffhandball' });

export const FFHB_BASE_URL = 'https://www.ffhandball.fr';
const API_PATH = '/wp-json/competitions/v1/computeBlockAttributes';
// Any page of the site carries the key; this one is the lightest stable one.
const KEY_PAGE = '/competitions/';
const REQUEST_TIMEOUT_MS = 20_000;

// The blocks this integration reads.
export const BLOCKS = {
  // The team, its pool and phase (and every team of a pool, without a team).
  POOL: 'competitions---poule-selector',
  // Every match of a team, the whole season.
  MATCHES: 'competitions---rencontre-list',
  // The standings of the team's pool.
  STANDINGS: 'competitions---mini-classement-or-ads',
};

/** Decode an obfuscated answer: base64, XOR with the key, UTF-8 JSON. */
export function decodePayload(payload, key) {
  const bytes = Buffer.from(payload, 'base64');
  const keyBytes = Buffer.from(key, 'latin1');
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] ^= keyBytes[i % keyBytes.length];
  }
  return JSON.parse(bytes.toString('utf8'));
}

/** The reverse of {@link decodePayload}, for the tests. */
export function encodePayload(data, key) {
  const bytes = Buffer.from(JSON.stringify(data), 'utf8');
  const keyBytes = Buffer.from(key, 'latin1');
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] ^= keyBytes[i % keyBytes.length];
  }
  return bytes.toString('base64');
}

/** The key the site writes on its pages, or null. */
export function keyFromPage(html) {
  return String(html).match(/data-cfk="([^"]+)"/)?.[1] ?? null;
}

export class FfhbError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'FfhbError';
    this.status = status;
  }
}

export class FfhbClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] injected in the tests
   * @param {string} [options.baseUrl]
   * @param {string} [options.userAgent]
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, baseUrl = FFHB_BASE_URL, userAgent } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.userAgent =
      userAgent ?? 'gladys-ffhandball (+https://github.com/prohand/gladys-ffhandball)';
    this.key = null;
    this.keyPromise = null;
  }

  async request(path) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { 'user-agent': this.userAgent, accept: 'application/json, text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new FfhbError(`ffhandball.fr unreachable: ${err.message}`, { cause: err });
    }
    if (!response.ok) {
      throw new FfhbError(`ffhandball.fr answered HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return response;
  }

  /** The decoding key, read from a page once and shared by concurrent reads. */
  async getKey({ refresh = false } = {}) {
    if (refresh) {
      this.key = null;
      this.keyPromise = null;
    }
    if (this.key) {
      return this.key;
    }
    this.keyPromise ??= (async () => {
      const html = await (await this.request(KEY_PAGE)).text();
      const key = keyFromPage(html);
      if (!key) {
        throw new FfhbError('ffhandball.fr changed: no decoding key on its pages');
      }
      logger.debug('Decoding key read from ffhandball.fr');
      this.key = key;
      return key;
    })().finally(() => {
      this.keyPromise = null;
    });
    return this.keyPromise;
  }

  /**
   * The data of one block of the site.
   * @param {string} block one of {@link BLOCKS}
   * @param {Record<string, string>} params the page parameters
   */
  async fetchBlock(block, params) {
    const query = new URLSearchParams({ block, ...params });
    const response = await this.request(`${API_PATH}?${query}`);
    let body;
    try {
      body = await response.json();
    } catch (err) {
      throw new FfhbError(`ffhandball.fr answered something else than data for ${block}`, {
        cause: err,
      });
    }
    // An object is either an error of the REST route or, should the site stop
    // obfuscating one day, the data itself.
    if (typeof body !== 'string') {
      if (body?.code && body?.message) {
        throw new FfhbError(`ffhandball.fr refused ${block}: ${body.message}`, {
          status: body.data?.status,
        });
      }
      return body;
    }
    try {
      return decodePayload(body, await this.getKey());
    } catch (err) {
      if (err instanceof FfhbError) {
        throw err;
      }
      // The site rotated its key: read it again, once.
      logger.info('The ffhandball.fr data no longer decodes: reading its key again');
      try {
        return decodePayload(body, await this.getKey({ refresh: true }));
      } catch (retryErr) {
        if (retryErr instanceof FfhbError) {
          throw retryErr;
        }
        throw new FfhbError('ffhandball.fr changed the way it encodes its data', {
          cause: retryErr,
        });
      }
    }
  }

  /**
   * Everything known about one followed team: its pool, its matches and the
   * standings of its pool, read in parallel.
   * @param {{ seasonId: string, type: string, competition: string, teamId: string }} ref
   */
  async fetchTeam(ref) {
    const params = {
      ext_saison_id: ref.seasonId,
      url_competition_type: ref.type,
      url_competition: ref.competition,
      ext_equipe_id: ref.teamId,
    };
    const [pool, matches, standings] = await Promise.all([
      this.fetchBlock(BLOCKS.POOL, params),
      this.fetchBlock(BLOCKS.MATCHES, params),
      this.fetchBlock(BLOCKS.STANDINGS, params),
    ]);
    return { pool, matches, standings };
  }

  /**
   * Every team of a competition, pool by pool, with the address of its page.
   * @param {{ seasonId: string, type: string, competition: string, poolId: string|null }} ref
   */
  async listTeams(ref) {
    const base = {
      ext_saison_id: ref.seasonId,
      url_competition_type: ref.type,
      url_competition: ref.competition,
    };
    const first = await this.fetchBlock(BLOCKS.POOL, {
      ...base,
      ...(ref.poolId ? { ext_poule_id: ref.poolId } : {}),
    });
    const pools = ref.poolId ? [] : (first.poules ?? []).slice(1);
    const others = await Promise.all(
      pools.map((pool) =>
        this.fetchBlock(BLOCKS.POOL, { ...base, ext_poule_id: pool.ext_pouleId }),
      ),
    );
    const season = Number(ref.seasonId) + 2004;
    const prefix =
      `${this.baseUrl}/competitions/saison-${season}-${season + 1}-${ref.seasonId}/` +
      `${ref.type}/${ref.competition}/`;
    return [first, ...others].map((answer) => ({
      pool: answer.selected_poule?.libelle ?? '',
      teams: (answer.equipe_options ?? []).map((team) => ({
        name: team.libelle,
        url: `${prefix}equipe-${team.ext_equipeId}/`,
      })),
    }));
  }
}
