# Encrypted Credentials — Implementation Plan (revised)

## Overview

All LLM credentials are stored encrypted in Cribl KV (`?encrypted=true`). The Cribl proxy reads encrypted KV values server-side and injects them as headers — the browser never needs to read credentials back. A **sentinel key** (`anthropicApiKeySet`, `bedrockCredsSet`) is written alongside each secret so the app can check "is this configured?" without reading the encrypted value.

---

## Architecture

| Credential | KV key (encrypted) | Sentinel key | How injected |
|---|---|---|---|
| Anthropic API key | `anthropicApiKey` | `anthropicApiKeySet` | `proxies.yml` → `x-api-key: kv.anthropicApiKey` |
| Bedrock Access Key ID | `bedrockAccessKeyId` | `bedrockCredsSet` | `proxies.yml` (future — current bedrockAuth pattern unchanged) |
| Bedrock Secret Access Key | `bedrockSecretAccessKey` | `bedrockCredsSet` | (same) |

The existing Bedrock `bedrockAuth` KV relay (browser writes pre-signed Authorization header, proxy injects it) is unchanged — the AWS key/secret are now stored encrypted.

---

## Tasks

1. **`src/lib/kvstore.ts`**
   - Add `kvSetEncrypted(key, value)` — PUT with `?encrypted=true`, `Content-Type: text/plain`, raw string body
   - Update `loadSettings()`: read config blob (non-credential fields only) + read sentinel keys → return `Settings` with empty credential strings but `anthropicApiKeySet` / `bedrockCredsSet` booleans set
   - Update `saveSettings()`: save only `{provider, model, bedrockRegion}` to config blob; if credential fields are non-empty write them encrypted + write their sentinels
   - Add `clearAnthropicKey()` export: delete `anthropicApiKey` + `anthropicApiKeySet`
   - Add `clearBedrockCreds()` export: delete `bedrockAccessKeyId` + `bedrockSecretAccessKey` + `bedrockCredsSet`

2. **`src/types/index.ts`**
   - Add `anthropicApiKeySet?: boolean` and `bedrockCredsSet?: boolean` to `Settings` (in-memory only, not written to config blob)

3. **`config/proxies.yml`**
   - Under `api.anthropic.com`, add `headers.inject.x-api-key: kv.anthropicApiKey`

4. **`src/lib/ai/anthropic.ts`**
   - Remove `if (apiKey) headers['x-api-key'] = apiKey` — proxy now injects it; the `apiKey` param becomes unused/optional and is dropped from the call site

5. **`src/lib/ai/index.ts`**
   - Stop passing `settings.anthropicApiKey` to `streamAnthropic`

6. **`src/components/Settings/SettingsModal.tsx`**
   - Credential fields show a "••••• (configured)" disabled placeholder when `*Set` flag is true and input is empty
   - "Clear" button next to each configured credential group
   - On close/save: only include credential fields in returned `Settings` if the user typed something new; call `clearAnthropicKey()` / `clearBedrockCreds()` when clearing

7. **Build verification** — `npm run build` clean
