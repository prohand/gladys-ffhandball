// -----------------------------------------------------------------------------
// Entry point of the FFHandball integration.
//
// Role of this file: wire the SDK to the team watcher (src/watcher.js), which
// reads ffhandball.fr, and to the capabilities built on it (src/capabilities/).
// It holds no handball logic:
//   1. it instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. it registers the event handlers BEFORE connect();
//   3. it connects, publishes the followed teams and starts the watcher.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { FfhbClient } from './src/ffhandball/client.js';
import { Store } from './src/store.js';
import { TeamWatcher } from './src/watcher.js';
import { ACTION_KEYS, ACTIONS } from './src/capabilities/actions.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { refreshWidgets, WIDGETS } from './src/capabilities/widgets.js';

// A promise rejected with nobody listening (a timer callback) would terminate
// Node: log it and keep following the teams.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

const gladys = new GladysIntegration();
const store = new Store();
const watcher = new TeamWatcher({
  gladys,
  client: new FfhbClient(),
  store,
  onRefreshed: refreshWidgets,
});
watcher.setConfig(normalizeConfig());

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the followed teams');
  await watcher.publishDevices({ force: true });
});

// --- A team device was created: send it its states at once -------------------
// Gladys drops the states of a feature that does not exist yet; the SDK
// forgets what it published for the device, so the next publication sends
// everything again.
gladys.onDeviceCreated(async () => {
  await watcher.publishStates();
});

// --- Manifest actions: buttons in the Configuration screen -------------------
gladys.onAction('test_connection', () => ACTIONS[ACTION_KEYS.TEST_CONNECTION](watcher));
gladys.onAction('list_teams', (fields) => ACTIONS[ACTION_KEYS.LIST_TEAMS](watcher, { fields }));

// --- Scene actions (Gladys 5.1+) ---------------------------------------------
// Scene TRIGGERS need no handler: the watcher fires them with
// publishSceneEvent when it sees the change (see src/watcher.js).
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(watcher, { fields, config: watcher.config }));
}

// --- Dashboard widgets (Gladys 5.1+) -----------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(watcher, request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(watcher, { actionKey, params, settings }),
    );
  }
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  await applyConfig(newConfig);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    await applyConfig(await gladys.getConfig());
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  watcher.stop();
});

async function applyConfig(rawConfig) {
  watcher.setConfig(normalizeConfig(rawConfig));
  // The first read publishes the devices, named after their teams (or after
  // their id when the site could not be read): see TeamWatcher.runRefresh.
  await watcher.start();
}

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  watcher.stop();
  await store.save();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the FFHandball integration...');
await store.load();
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
