import React, { useState } from 'react';
import { useSunglasses } from '@drakkar.software/sunglasses-react';

export function App(): React.ReactElement {
  const client = useSunglasses();
  const [userId, setUserId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [consentStatus, setConsentStatus] = useState(client.getConsentStatus());

  const addLog = (msg: string): void =>
    setLog((prev) => [`[${new Date().toISOString()}] ${msg}`, ...prev.slice(0, 29)]);

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
    client.capture('button_clicked', { button: 'demo_button', page: 'home' });
    addLog('capture("button_clicked") sent');
  };

  const handleIdentify = (): void => {
    if (!userId.trim()) return;
    client.identify(userId.trim(), { plan: 'free' });
    addLog(`identify("${userId.trim()}") sent`);
  };

  const handleReset = async (): Promise<void> => {
    await client.reset();
    setUserId('');
    addLog('reset() — identity cleared, new anonymous ID generated');
  };

  const handleFlush = async (): Promise<void> => {
    await client.flush();
    addLog('flush() — queue sent to all adapters');
  };

  return (
    <div>
      <h1>SunGlasses — Web Demo</h1>

      <section>
        <h2>Consent</h2>
        <p>
          Status: <strong>{consentStatus}</strong>
        </p>
        <p style={{ fontSize: 13, color: '#666' }}>
          Events are <strong>silently dropped</strong> while opted out — no network calls, no
          storage writes.
        </p>
        <button className="success" onClick={handleOptIn}>
          Opt In
        </button>
        <button className="danger" onClick={handleOptOut}>
          Opt Out
        </button>
      </section>

      <section>
        <h2>Events</h2>
        <button className="primary" onClick={handleCapture}>
          Capture "button_clicked"
        </button>
        <button className="primary" onClick={handleFlush}>
          Flush Queue
        </button>
      </section>

      <section>
        <h2>Identity</h2>
        <input
          type="text"
          placeholder="User ID (e.g. user-123)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={{ padding: '8px', marginRight: 8, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button className="primary" onClick={handleIdentify}>
          Identify
        </button>
        <button className="danger" onClick={handleReset}>
          Reset Identity
        </button>
      </section>

      <section>
        <h2>Event Log</h2>
        <pre>{log.length === 0 ? '(no actions yet)' : log.join('\n')}</pre>
        <p style={{ fontSize: 12, color: '#888' }}>
          Open DevTools → Console to see full event payloads (debug mode is on).
        </p>
      </section>
    </div>
  );
}
