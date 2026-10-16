// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { ACTIONS } from '../src/capabilities/actions.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Every list of form fields the manifest declares (same field grammar).
const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

test('every manifest action is registered in index.js, and has a handler', () => {
  for (const action of manifest.actions) {
    assert.match(
      indexSource,
      new RegExp(`onAction\\('${action.key}'`),
      `manifest action "${action.key}" is not registered`,
    );
    assert.equal(typeof ACTIONS[action.key], 'function', `action "${action.key}" has no handler`);
  }
  assert.deepEqual(Object.keys(ACTIONS).sort(), keysOf(manifest.actions).sort());
});

test('every scene action has a handler, and every handler is declared', () => {
  assert.deepEqual(Object.keys(SCENE_ACTIONS).sort(), keysOf(manifest.scene_actions).sort());
  assert.match(indexSource, /Object\.entries\(SCENE_ACTIONS\)/);
  assert.match(indexSource, /onSceneAction\(key/);
});

test('every widget has a content handler, and every handler is declared', () => {
  assert.deepEqual(Object.keys(WIDGETS).sort(), keysOf(manifest.widgets).sort());
  for (const [key, widget] of Object.entries(WIDGETS)) {
    assert.equal(typeof widget.get, 'function', `widget "${key}" has no content handler`);
  }
  assert.match(indexSource, /onWidgetGet\(key/);
  assert.match(indexSource, /onWidgetAction\(key/);
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  assert.deepEqual(Object.values(SCENE_TRIGGERS).sort(), keysOf(manifest.scene_triggers).sort());
});

test('every field uses a type the store accepts, with a snake_case key', () => {
  const types = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];
  for (const field of allFields) {
    assert.ok(types.includes(field.type), `field "${field.key}": unknown type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}" must be snake_case`);
    if (field.placeholder !== undefined) {
      assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder object`);
      assert.ok(['string', 'number', 'secret'].includes(field.type));
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config key "${field.key}" is missing in DEFAULT_CONFIG`,
    );
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
    if (field.min !== undefined) {
      // What the form refuses, the code clamps the same way.
      assert.equal(normalizeConfig({ [field.key]: field.min - 1 })[field.key], field.min);
      assert.equal(normalizeConfig({ [field.key]: field.max + 1 })[field.key], field.max);
    }
  }
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.deepEqual(language.options.map((option) => option.value).sort(), [...LANGUAGES].sort());
});

test('section fields are purely presentational', () => {
  const sections = allFields.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length > 0);
  for (const field of dynamic) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-ffhandball:${manifest.version}`);
});

test('the integration reads a cloud service: it declares the cloud transport', () => {
  // ffhandball.fr is on the internet: there is no local channel to prefer, so
  // the Configuration screen shows no "Prefer the local connection" toggle.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('the categories stay inside the vocabulary the store indexes', () => {
  const vocabulary = [
    'climate',
    'lighting',
    'energy',
    'security',
    'multimedia',
    'appliances',
    'environment',
    'protocols',
    'network',
    'notifications',
    'assistants',
    'services',
  ];
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(vocabulary.includes(category), `unknown category "${category}"`);
  }
});

test('the Gladys floor covers every field the manifest declares', () => {
  // `categories` needs 4.86; the widgets and scene declarations need 5.1.
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), `got ${manifest.gladys_version}`);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  // Gladys shows the reader's language and falls back to English: a text
  // missing one of them shows up in English in the middle of a translated
  // screen. The store accepts any two-letter key, so nothing else catches it.
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 100, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of allFields.filter((field) => field.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
});
