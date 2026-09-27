/**
 * Settings screen, opened from Settings → Apps → Plugins → PDF ⇄ Note Swipe.
 *
 * @format
 */

import React, {useEffect, useReducer} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {DEFAULTS, FINGER_CHOICES, Settings, getSettings, subscribe, updateSettings} from './src/settings';
import {orientationInfo, refreshOrientation} from './src/switcher';

function FingerChoice({label, hint, k}: {label: string; hint: string; k: keyof Settings}) {
  const value = getSettings()[k];
  return (
    <View style={styles.row}>
      <View style={styles.labelBox}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      {FINGER_CHOICES.map(n => (
        <Pressable
          key={n}
          style={[styles.choice, value === n && styles.choiceOn]}
          onPress={() => updateSettings({[k]: n} as Partial<Settings>)}>
          <Text style={[styles.choiceText, value === n && styles.choiceOnText]}>{n} fingers</Text>
        </Pressable>
      ))}
    </View>
  );
}

function App(): React.JSX.Element {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    refreshOrientation().then(refresh);
    return subscribe(refresh);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PDF ⇄ Note Swipe settings</Text>
        <Pressable onPress={() => PluginManager.closePluginView()} style={styles.close}>
          <Text style={styles.title}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.intro}>
        Swipe up to jump between the last opened PDF and the last opened note. Choose how many fingers the swipe uses.
      </Text>

      <FingerChoice label="Portrait" hint="Default: 2 fingers" k="portraitFingers" />
      <FingerChoice
        label="Landscape"
        hint="Default: 3 fingers, since 2-finger swipes already scroll the page in landscape"
        k="landscapeFingers"
      />

      <Text style={styles.detected}>Detected now: {orientationInfo()}</Text>

      <Pressable style={styles.reset} onPress={() => updateSettings(DEFAULTS)}>
        <Text style={styles.choiceText}>Reset to defaults</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 36, backgroundColor: '#ffffff'},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  title: {fontSize: 30, fontWeight: '700', color: '#000000'},
  close: {padding: 8},
  intro: {fontSize: 20, lineHeight: 30, color: '#000000', marginVertical: 20},
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderColor: '#c9c9c9'},
  labelBox: {flex: 1, paddingRight: 16},
  label: {fontSize: 22, fontWeight: '600', color: '#000000'},
  hint: {fontSize: 17, lineHeight: 26, color: '#444444', marginTop: 4},
  choice: {borderWidth: 2, borderColor: '#000000', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, marginLeft: 12},
  choiceOn: {backgroundColor: '#000000'},
  choiceText: {fontSize: 20, color: '#000000'},
  choiceOnText: {color: '#ffffff'},
  detected: {fontSize: 16, color: '#444444', marginTop: 24, fontFamily: 'monospace'},
  reset: {alignSelf: 'flex-start', marginTop: 24, borderWidth: 2, borderColor: '#000000', borderRadius: 8, padding: 12},
});

export default App;
