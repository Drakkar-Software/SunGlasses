import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSunglasses } from '@drakkar.software/sunglasses-react-native';

export default function HomeScreen(): React.ReactElement {
  const client = useSunglasses();
  const [userId, setUserId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [consentStatus, setConsentStatus] = useState(client.getConsentStatus());

  const addLog = (msg: string): void =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);

  const handleOptIn = async (): Promise<void> => {
    await client.optIn();
    setConsentStatus(client.getConsentStatus());
    addLog('Opted IN ✓');
  };

  const handleOptOut = async (): Promise<void> => {
    await client.optOut();
    setConsentStatus(client.getConsentStatus());
    addLog('Opted OUT ✓');
  };

  const handleCapture = (): void => {
    client.capture('button_tapped', { button: 'demo_button', screen: 'home' });
    addLog('capture("button_tapped") sent');
  };

  const handleIdentify = (): void => {
    if (!userId.trim()) return;
    client.identify(userId.trim(), { plan: 'free' });
    addLog(`identify("${userId.trim()}") sent`);
  };

  const handleReset = async (): Promise<void> => {
    await client.reset();
    setUserId('');
    addLog('reset() — identity cleared');
  };

  const handleFlush = async (): Promise<void> => {
    await client.flush();
    addLog('flush() — queue sent to adapters');
  };

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>SunGlasses RN Demo</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consent</Text>
        <Text style={styles.status}>Status: <Text style={styles.bold}>{consentStatus}</Text></Text>
        <Text style={styles.hint}>Events are silently dropped while opted out.</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.success]} onPress={handleOptIn}>
            <Text style={styles.btnText}>Opt In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.danger]} onPress={handleOptOut}>
            <Text style={styles.btnText}>Opt Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Events</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={handleCapture}>
            <Text style={styles.btnText}>Capture Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={handleFlush}>
            <Text style={styles.btnText}>Flush Queue</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity</Text>
        <TextInput
          style={styles.input}
          placeholder="User ID (e.g. user-123)"
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.primary]} onPress={handleIdentify}>
            <Text style={styles.btnText}>Identify</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.danger]} onPress={handleReset}>
            <Text style={styles.btnText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Log</Text>
        <View style={styles.logBox}>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>No actions yet</Text>
          ) : (
            log.map((line, i) => (
              <Text key={i} style={styles.logLine}>{line}</Text>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f9f9f9' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, marginTop: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  status: { fontSize: 14, marginBottom: 4 },
  bold: { fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#666', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  btnText: { color: 'white', fontWeight: '600' },
  primary: { backgroundColor: '#6366f1' },
  danger: { backgroundColor: '#ef4444' },
  success: { backgroundColor: '#22c55e' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: 'white',
  },
  logBox: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
  },
  logEmpty: { color: '#666', fontSize: 12 },
  logLine: { color: '#d4d4d4', fontSize: 11, marginBottom: 2 },
});
