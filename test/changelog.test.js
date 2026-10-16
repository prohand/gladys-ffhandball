import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-ffhandball';

test('the first release moves Unreleased under its version and links its tag', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-20');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-20\n\n### Added\n\n- Something\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1`));
});

test('a later release compares with the previous tag', () => {
  const before = `## [Unreleased]\n\n- Fix.\n\n## [1.0.1] - 2026-10-20\n\n- A.\n\n[Unreleased]: ${REPO}/compare/v1.0.1...HEAD\n[1.0.1]: ${REPO}/releases/tag/v1.0.1\n`;
  const after = rollChangelog(before, '1.0.2', '2026-10-21');
  assert.match(after, new RegExp(`\\[1\\.0\\.2\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.v1\\.0\\.2`));
});

test('an empty Unreleased section still names the release', () => {
  const after = rollChangelog('## [Unreleased]\n', '1.1.0', '2026-10-22');
  assert.match(after, /## \[1\.1\.0\] - 2026-10-22\n\n- Maintenance release/);
});

test('the changelog of this repository has an Unreleased section and its link', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/`, 'm'));
});
