import { useState } from 'react';
import type { Settings, AIProvider } from '../../types';
import {
  ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODEL,
  BEDROCK_MODELS, DEFAULT_BEDROCK_MODEL,
} from '../../lib/ai';

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
  const [anthropicApiKey, setAnthropicApiKey] = useState(initialSettings.anthropicApiKey ?? '');
  const [bedrockRegion, setBedrockRegion] = useState(initialSettings.bedrockRegion ?? 'us-east-1');
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState(initialSettings.bedrockAccessKeyId ?? '');
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState(initialSettings.bedrockSecretAccessKey ?? '');

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel(p === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_BEDROCK_MODEL);
  };

  const handleClose = () => {
    onClose({ provider, model, anthropicApiKey, bedrockRegion, bedrockAccessKeyId, bedrockSecretAccessKey });
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
              <input
                className="field-input"
                type="password"
                placeholder="sk-ant-api03-..."
                value={anthropicApiKey}
                onChange={e => setAnthropicApiKey(e.target.value)}
              />
              <p className="field-hint">
                Sent as <code>x-api-key</code> header through the Cribl proxy.
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
                  IAM user needs <code>bedrock:InvokeModelWithResponseStream</code> permission.
                </p>
              </div>
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
