# FFHandball — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to
**ffhandball.fr**, the website of the French handball federation: follow your teams —
professional, national, regional or departmental — with their standings, results and next
matches, in your dashboards and your scenes.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md)
· [Español](./docs/es.md).

> Not affiliated with the Fédération Française de Handball. The integration reads the public
> website, the way a browser does.

## What it does

| Surface                 | Content                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Device** (one / team) | Rank, points, played / won / drawn / lost, goal difference, last result (1 / 0 / −1) and score, last and next match as text, days until the next match |
| **Scene triggers**      | A match result is published · A match is about to start · A team's rank changed · A match was rescheduled                                              |
| **Scene actions**       | Get a team's next match · Get a team's last result · Get a team's standing                                                                             |
| **Dashboard widgets**   | Handball team · Handball standings · Next matches · Last results                                                                                       |
| **Configuration**       | Test the connection · List the teams of a competition                                                                                                  |

Every text is in **English, French, German and Spanish**.

## Transport: cloud

The manifest declares `"transports": ["cloud"]`: the data comes from ffhandball.fr over the
internet, there is no local channel. Each team device carries a transport badge: `cloud` when
the team was read, `unreachable` when the site did not answer.

## How it reads ffhandball.fr

The federation publishes no public API. Its website renders every competition block from a
WordPress REST route, `wp-json/competitions/v1/computeBlockAttributes`, whose answers are
obfuscated (base64 + XOR with a key printed on every page). The integration reads that key
from a page, decodes the answers exactly as the site's own JavaScript does, and reads three
blocks per team: the pool, the season's matches and the standings. See
[`src/ffhandball/client.js`](./src/ffhandball/client.js).

It only sends public `GET` requests, every 30 minutes by default; the site caches its answers
an hour anyway. No account, no key, nothing to install.

The scene triggers fire on **changes** — a score that appears, a rank that moves, a kick-off
that is close or moved — once each, even across restarts: what was already announced is kept
in `/data/state.json`, the only writable path of the container.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring
├─ src/
│  ├─ config.js                      # defaults, team / competition address parsing
│  ├─ i18n.js                        # en, fr, de, es
│  ├─ watcher.js                     # refresh clock, minute tick, change detection
│  ├─ store.js                       # /data/state.json
│  ├─ ffhandball/
│  │  ├─ client.js                   # ffhandball.fr reader (key, decoding, blocks)
│  │  ├─ team.js                     # raw blocks -> one team, from its own side
│  │  └─ format.js                   # dates and texts per language (Paris time)
│  ├─ devices/team.js                # the team device and its states
│  └─ capabilities/
│     ├─ actions.js                  # Configuration screen buttons
│     ├─ scenes.js                   # scene triggers data + scene actions
│     └─ widgets.js                  # dashboard widgets
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake ffhandball.fr + SDK fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · SECURITY.md · CLAUDE.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ffhandball" \
FFHANDBALL_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor in the container.
`FFHANDBALL_DATA_DIR` (default `/data`) is where the event memory is written.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test: no network, a fake ffhandball.fr and the SDK fake Gladys
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs the first three on Node 22 and 24 for every push and pull request, and on pull
requests the store checks and a Docker build.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json`, the manifest `version` and `docker_image`, moves the
changelog section, pushes the `vX.Y.Z` tag, builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/prohand/gladys-ffhandball` and publishes the GitHub Release.

For the store: the repository must be public and carry the GitHub topic
`gladys-assistant-integration`, and the GHCR package must be public.

## License

Apache-2.0
