import { useState } from 'react';
import type { Settings, AIProvider } from '../../types';
import {
  ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL,
  BEDROCK_MODELS, DEFAULT_BEDROCK_MODEL,
} from '../../lib/ai';
import { clearAnthropicKey, clearBedrockCreds } from '../../lib/kvstore';

interface Props {
  initialSettings: Partial<Settings>;
  onClose: (saved: Partial<Settings>) => void;
}

const BEDROCK_REGIONS = [
  'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1',
  'ap-northeast-1', 'ap-southeast-1', 'ap-southeast-2',
];

export function SettingsModal({ initialSettings, onClose }: Props) {
  const [provider, setProvider] = useState<AIProvider>(initialSettings.provider ?? 'anthropic');
  const [model, setModel] = useState(initialSettings.model ?? DEFAULT_ANTHROPIC_MODEL);
  const [bedrockRegion, setBedrockRegion] = useState(initialSettings.bedrockRegion ?? 'us-east-1');

  // Credential inputs — always start empty. Filled only when user types a new value.
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('');
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState('');

  // Track local "configured" state, initialised from sentinel flags.
  const [anthropicKeySet, setAnthropicKeySet] = useState(initialSettings.anthropicApiKeySet ?? false);
  const [bedrockCredsSet, setBedrockCredsSet] = useState(initialSettings.bedrockCredsSet ?? false);

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel(p === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_BEDROCK_MODEL);
  };

  const handleClearAnthropicKey = async () => {
    await clearAnthropicKey();
    setAnthropicKeySet(false);
    setAnthropicApiKey('');
  };

  const handleClearBedrockCreds = async () => {
    await clearBedrockCreds();
    setBedrockCredsSet(false);
    setBedrockAccessKeyId('');
    setBedrockSecretAccessKey('');
  };

  const handleClose = () => {
    // Only include credential fields if the user typed a new value — never
    // pass an empty string for a credential that is already configured.
    const saved: Partial<Settings> = {
      provider,
      model,
      bedrockRegion,
      anthropicApiKeySet: anthropicKeySet || !!anthropicApiKey,
      bedrockCredsSet: bedrockCredsSet || !!(bedrockAccessKeyId || bedrockSecretAccessKey),
    };
    if (anthropicApiKey) saved.anthropicApiKey = anthropicApiKey;
    if (bedrockAccessKeyId) saved.bedrockAccessKeyId = bedrockAccessKeyId;
    if (bedrockSecretAccessKey) saved.bedrockSecretAccessKey = bedrockSecretAccessKey;
    onClose(saved);
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">AI Provider</label>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${provider === 'anthropic' ? 'active' : ''}`}
                onClick={() => handleProviderChange('anthropic')}
              >
                Anthropic
              </button>
              <button
                className={`toggle-btn ${provider === 'bedrock' ? 'active' : ''}`}
                onClick={() => handleProviderChange('bedrock')}
              >
                AWS Bedrock
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Model</label>
            <select
              className="field-select"
              value={model}
              onChange={e => setModel(e.target.value)}
            >
              {(provider === 'anthropic' ? ANTHROPIC_MODELS : BEDROCK_MODELS).map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {provider === 'anthropic' && (
            <div className="field-group">
              <label className="field-label">API Key</label>
              {anthropicKeySet && !anthropicApiKey ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="field-input"
                    type="password"
                    placeholder="Configured — enter new key to replace"
                    value=""
                    readOnly
                    style={{ flex: 1, opacity: 0.6 }}
                  />
                  <button className="btn-secondary" onClick={handleClearAnthropicKey}>
                    Clear
                  </button>
                </div>
              ) : (
                <input
                  className="field-input"
                  type="password"
                  placeholder="sk-ant-api03-..."
                  value={anthropicApiKey}
                  onChange={e => setAnthropicApiKey(e.target.value)}
                />
              )}
              <p className="field-hint">
                Stored encrypted. Injected as <code>x-api-key</code> by the Cribl proxy — never sent by the browser.
                Get a key at{' '}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                  style={{ color: 'var(--accent)' }}>console.anthropic.com</a>.
              </p>
            </div>
          )}

          {provider === 'bedrock' && (
            <>
              <div className="field-group">
                <label className="field-label">AWS Region</label>
                <select className="field-select" value={bedrockRegion}
                  onChange={e => setBedrockRegion(e.target.value)}>
                  {BEDROCK_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {bedrockCredsSet && !bedrockAccessKeyId && !bedrockSecretAccessKey ? (
                <div className="field-group">
                  <label className="field-label">AWS Credentials</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      className="field-input"
                      type="password"
                      placeholder="Configured — enter new credentials to replace"
                      value=""
                      readOnly
                      style={{ flex: 1, opacity: 0.6 }}
                    />
                    <button className="btn-secondary" onClick={handleClearBedrockCreds}>
                      Clear
                    </button>
                  </div>
                  <p className="field-hint">
                    Stored encrypted. Re-enter credentials to use Bedrock in this session.
                  </p>
                </div>
              ) : (
                <>
                  <div className="field-group">
                    <label className="field-label">Access Key ID</label>
                    <input className="field-input" type="text" placeholder="AKIA..."
                      value={bedrockAccessKeyId}
                      onChange={e => setBedrockAccessKeyId(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Secret Access Key</label>
                    <input className="field-input" type="password" placeholder="••••••••"
                      value={bedrockSecretAccessKey}
                      onChange={e => setBedrockSecretAccessKey(e.target.value)} />
                    <p className="field-hint">
                      Stored encrypted. IAM user needs <code>bedrock:InvokeModelWithResponseStream</code> permission.
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={handleClose}>Save</button>
        </div>
      </div>
    </div>
  );
}
