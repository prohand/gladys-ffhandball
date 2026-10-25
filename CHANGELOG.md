# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Catalog: the integration now sits on the new **Leisure** shelf (next to Services), is found by
  search terms such as "ffhb", "starligue" or "proligue", and is listed for France.

### Changed

- **Gladys 5.3.0 or later is now required** (the catalog search terms and country need it).
- SDK `@gladysassistant/integration-sdk` 0.16.

## [1.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-16

### Added

- Follow French handball teams from ffhandball.fr: paste the address of a team
  page, one per line, and each team becomes a Gladys device (cloud transport,
  nothing to install, no account).
- Team features: rank, points, played / won / drawn / lost, goal difference,
  last result and score, last match and next match as text, days until the
  next match.
- Scene triggers (Gladys 5.1): a match result is published, a match is about to
  start (configurable reminder), a team's rank changed, a match was
  rescheduled. Each one fires once, even across restarts.
- Scene actions: get a team's next match, last result and standing.
- Dashboard widgets: one team at a glance, the standings of its pool, the next
  matches and the last results of every followed team.
- Configuration screen buttons: "Test the connection" and "List the teams of a
  competition" (gives the address of every team page to paste).
- English, French, German and Spanish everywhere: configuration screen,
  messages, widgets, scene cards and documentation.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on
  pull requests), UI-driven Release workflow, multi-arch image build, GitHub
  Releases, Dependabot.
- `SECURITY.md`, `CLAUDE.md` and this changelog.

[Unreleased]: https://github.com/prohand/gladys-ffhandball/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/prohand/gladys-ffhandball/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-ffhandball/releases/tag/v1.0.1
