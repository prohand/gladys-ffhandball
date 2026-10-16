# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when
working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that follows French handball teams on
**ffhandball.fr**: one Gladys device per team (rank, points, record, last result, next match),
scene triggers (result published, match about to start, rank changed, match rescheduled),
scene actions (next match, last result, standing) and four dashboard widgets (team, standings,
fixtures, results). Gladys 5.1+. Transport: **cloud** only.

Started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js); the
GitHub workflows are the ones of [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/watcher.test.js            # one file
node --test --test-name-pattern "reminder"  # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `test` on Node 22 and 24, and on
pull requests the store checks and a Docker build: run the three commands before pushing.

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/config.js                DEFAULT_CONFIG (mirrors the manifest) + team / competition URL parsing
src/i18n.js                  LANGUAGES (en, fr, de, es), pick, localize
src/ffhandball/client.js     ffhandball.fr reader: computeBlockAttributes route + data-cfk key
src/ffhandball/team.js       raw blocks -> one team, from its own side (opponent, result, venue)
src/ffhandball/format.js     texts and dates per language, in Europe/Paris time
src/devices/team.js          the team device: features, discovery payload, states
src/watcher.js               refresh clock + minute tick, change detection -> scene events
src/store.js                 /data/state.json: what was already announced (survives restarts)
src/capabilities/actions.js  Configuration screen buttons (test_connection, list_teams)
src/capabilities/scenes.js   scene trigger data + scene action handlers
src/capabilities/widgets.js  dashboard widget contents + refresh button
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test, fake ffhandball.fr (test/helpers/fakeFfhb.js) + SDK fake Gladys
```

### How ffhandball.fr is read

There is no public API. The website renders its competition blocks from
`/wp-json/competitions/v1/computeBlockAttributes?block=<name>&ext_saison_id=…&url_competition_type=…&url_competition=…&ext_equipe_id=…`.
The answer is a JSON string: base64 of the JSON XORed with a key the site prints on every page
(`<body data-cfk="…">`). `FfhbClient` reads the key once from `/competitions/`, and again only
when an answer stops decoding (key rotation). Blocks used: `competitions---poule-selector`
(team + pool), `competitions---rencontre-list` (season matches), `competitions---mini-classement-or-ads`
(standings). The site caches answers one hour (CloudFront): refreshing faster brings nothing.

A team page address is
`/competitions/saison-<Y>-<Y+1>-<seasonId>/<type>/<competition-slug>/equipe-<teamId>/`
(`seasonId` = year − 2004). Internal ids (`equipe1Id`, `equipeId`) differ from public ones
(`ext_equipeId`): `poule-selector.selected_equipe` maps one to the other.

### Invariants worth knowing

- **External ids are forever.** Device: `gladys.externalIds('team', <ext_equipeId>)`. Feature
  keys (`FEATURES` in `src/devices/team.js`), config keys, action / trigger / scene action /
  widget keys are stored by users: never rename them. Team ids change every season on the site:
  that is a new device, by design.
- **Events fire once per change, never on the past.** A team seen for the first time is only
  memorized. Results older than 3 days seen late, corrected scores and a first date given to a
  match fire nothing. The memory is `/data/state.json` (pruned after 120 days).
- **No loops**: scene actions only read (memory, or a silent first read); they never refresh,
  because a refresh can fire triggers.
- **Gladys does not poll** (`should_poll: false`): the watcher owns the refresh clock
  (`refresh_minutes`) and a one-minute tick (reminders, day count) on in-memory data.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included.
- **The rootfs is read-only**: write only under `/data`. Tests never touch the network.
- **Transport badge**: `cloud` when the team was read, `unreachable` otherwise.

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit `version` in
  `package.json` or the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js`
  checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow moves the section.
- **Manifest.** Every text is `{ en, fr, de, es }` (test enforced), catalog description 10–100
  characters per language, widget labels 3–30. `test/manifest.test.js` ties the manifest to the
  code (defaults, handlers, triggers, widgets): change both sides together.
- **User-facing text** is in the four languages: messages (`localize` / `pick`), manifest,
  widgets, and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Widgets**: `validateWidgetContent(content)` must stay `[]` (test enforced).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
