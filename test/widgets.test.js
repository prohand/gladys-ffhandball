import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { setup } from './helpers/setup.js';
import { fit, refreshWidgets, WIDGET_KEYS, WIDGETS } from '../src/capabilities/widgets.js';
import { LANGUAGES } from '../src/i18n.js';

const request = (settings = {}, language = 'fr') => ({ settings, language, units: 'metric' });

test('every widget content is rendered exactly as sent, in every language', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  for (const [key, widget] of Object.entries(WIDGETS)) {
    for (const language of LANGUAGES) {
      const content = await widget.get(watcher, request({}, language));
      // [] = nothing the core would drop, truncate or trim to the budget.
      assert.deepEqual(validateWidgetContent(content), [], `${key} (${language})`);
      assert.ok(content.components.length > 0, `${key} is never blank`);
    }
  }
});

test('the empty states are valid contents too', async () => {
  const { watcher, site } = await setup();
  site.down = true;
  await watcher.refreshAll();
  for (const [key, widget] of Object.entries(WIDGETS)) {
    const content = await widget.get(watcher, request());
    assert.deepEqual(validateWidgetContent(content), [], key);
  }
});

test('the live tiles of the team widget are features the team device publishes', async () => {
  const { gladys, watcher } = await setup();
  await watcher.refreshAll();
  const featureIds = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  const content = await WIDGETS[WIDGET_KEYS.TEAM].get(watcher, request());
  const tiles = content.components.filter((component) => component.device_feature);
  assert.equal(tiles.length, 3);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  }
});

test('a widget set on a team shows that team, an unknown one shows the empty state', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  const chosen = await WIDGETS[WIDGET_KEYS.TEAM].get(
    watcher,
    request({ device: 'ext:test-integration:team:2001' }),
  );
  assert.equal(chosen.components[0].text, 'HBC TEST');
  const unknown = await WIDGETS[WIDGET_KEYS.TEAM].get(
    watcher,
    request({ device: 'ext:test-integration:team:42' }),
  );
  assert.equal(unknown.components[0].type, 'text');
  assert.match(unknown.components[0].text.en, /No team read yet/);
});

test('the standings show the team among the others, highlighted', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  const content = await WIDGETS[WIDGET_KEYS.STANDINGS].get(watcher, request({ count: 3 }));
  const status = content.components.find((component) => component.type === 'status');
  assert.equal(status.items.length, 3);
  const highlighted = status.items.filter((item) => item.color === 'primary');
  assert.deepEqual(
    highlighted.map((item) => item.label),
    ['2. HBC TEST'],
  );
});

test('fixtures list the next matches, results the last ones, newest first', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  const fixtures = await WIDGETS[WIDGET_KEYS.FIXTURES].get(watcher, request());
  assert.deepEqual(
    fixtures.components[0].items.map((item) => item.title),
    ['HBC TEST – RIVAL C'],
  );
  const results = await WIDGETS[WIDGET_KEYS.RESULTS].get(watcher, request({ count: 8 }));
  assert.deepEqual(
    results.components[0].items.map((item) => item.badge.text),
    ['Nul 28-28', 'Victoire 30-25'],
  );
});

test('the refresh button reads the site again and answers a short toast', async () => {
  const { watcher, site } = await setup();
  await watcher.refreshAll();
  const message = await WIDGETS[WIDGET_KEYS.TEAM].action(watcher, { actionKey: 'refresh' });
  assert.equal(message.fr, 'Équipes actualisées: 1/1');
  for (const text of Object.values(message)) {
    assert.ok(text.length <= 200);
  }
  site.down = true;
  await assert.rejects(
    WIDGETS[WIDGET_KEYS.TEAM].action(watcher, { actionKey: 'refresh' }),
    /could not be read/,
  );
});

test('every button action of the contents is handled', async () => {
  const { watcher } = await setup();
  await watcher.refreshAll();
  for (const [key, widget] of Object.entries(WIDGETS)) {
    const content = await widget.get(watcher, request());
    for (const button of content.components.filter((c) => c.type === 'button' && c.action)) {
      assert.equal(typeof widget.action, 'function', `${key} has a button but no handler`);
      await widget.action(watcher, { actionKey: button.action.key, params: {} });
    }
  }
  await assert.rejects(
    WIDGETS[WIDGET_KEYS.TEAM].action(watcher, { actionKey: 'unknown' }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});

test('fit keeps a text within a length, with an ellipsis', () => {
  assert.equal(fit('abc', 5), 'abc');
  assert.equal(fit('abcdefgh', 5), 'abcd…');
  assert.equal(fit(null, 5), '');
});
