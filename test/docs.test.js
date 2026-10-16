import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const docs = Object.fromEntries(
  await Promise.all(
    LANGUAGES.map(async (language) => [
      language,
      await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

test('the documentation exists in every language, with the same sections', () => {
  const outline = (text) => text.match(/^#{1,3} /gm).join('');
  for (const language of LANGUAGES) {
    assert.equal(outline(docs[language]), outline(docs.en), `docs/${language}.md outline`);
  }
});

test('every scene variable and action output is documented in every language', () => {
  const keys = [
    ...manifest.scene_triggers.flatMap((trigger) => trigger.variables.map((v) => v.key)),
    ...manifest.scene_actions.flatMap((action) => action.outputs.map((o) => o.key)),
  ];
  for (const language of LANGUAGES) {
    for (const key of new Set(keys)) {
      assert.ok(docs[language].includes(`\`${key}\``), `docs/${language}.md misses \`${key}\``);
    }
  }
});

test('every scene trigger, action and widget is named in its own language', () => {
  for (const language of LANGUAGES) {
    for (const entry of [
      ...manifest.scene_triggers,
      ...manifest.scene_actions,
      ...manifest.widgets,
      ...manifest.actions,
    ]) {
      assert.ok(
        docs[language].includes(entry.label[language]),
        `docs/${language}.md misses "${entry.label[language]}"`,
      );
    }
  }
});
