/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager} from 'sn-plugin-lib';
import {loadSettings} from './src/settings';
import {start} from './src/switcher';
import {showView} from './src/view';

/** Toolbar buttons registered by the first release; the host keeps them until they are unregistered. */
const LEGACY_BUTTON_IDS = [201, 202];

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// No toolbar button: the plugin only reacts to swipes. Settings live in the plugin manager.
PluginManager.registerConfigButton();
PluginManager.registerConfigButtonListener({
  onClick() {
    showView('settings');
  },
});
loadSettings();

for (const id of LEGACY_BUTTON_IDS) {
  Promise.resolve()
    .then(() => PluginManager.unregisterButton(id))
    .catch(() => {});
}

start();
