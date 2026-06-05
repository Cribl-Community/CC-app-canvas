import type { Settings, ProjectMeta, ChatMessage, ProjectFiles } from '../types';

declare const CRIBL_API_URL: string;

function base(): string {
  return (window as unknown as { CRIBL_API_URL?: string }).CRIBL_API_URL
    ?? (typeof CRIBL_API_URL !== 'undefined' ? CRIBL_API_URL : '/api/v1');
}

// ── KV store (primary) ────────────────────────────────────────────────────────
// Cribl's fetch proxy rewrites CRIBL_API_URL + '/kvstore/...' to
// '/api/v1/a/{appId}/kvstore/...' automatically — no auth headers needed.
//
// Key findings from debugging:
// 1. Content-Type must be text/plain on PUT. Using application/json causes Cribl's
//    proxy to parse the body into a JS object; when constructing the GET Response it
//    calls .toString() → "[object Object]" instead of JSON.stringify, making the
//    value unreadable. text/plain preserves the JSON string intact.
// 2. kvListKeys returns a plain JSON array, not { keys: [...] }.
// 3. res.json() works correctly on text/plain-stored values.

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`${base()}/kvstore/${key}`);
    if (!res.ok) return null;
    let parsed = await res.json();
    // Handle double-encoded string values just in case
    if (typeof parsed === 'string') parsed = JSON.parse(parsed as string);
    return parsed as T;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    // Content-Type must be text/plain — see header comment above.
    await fetch(`${base()}/kvstore/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}

async function kvDelete(key: string): Promise<void> {
  try {
    await fetch(`${base()}/kvstore/${key}`, { method: 'DELETE' });
  } catch { /* ignore */ }
}

// Cribl KV list-keys returns a plain JSON array, e.g. ["projects/x/meta", ...]
async function kvListKeys(prefix: string): Promise<string[]> {
  try {
    const res = await fetch(`${base()}/kvstore/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Handle both plain array and { keys: [...] } wrapper formats
    if (Array.isArray(data)) return data as string[];
    if (data && Array.isArray(data.keys)) return data.keys as string[];
    return [];
  } catch {
    return [];
  }
}

// ── localStorage (cache / offline fallback) ───────────────────────────────────

const LS_PREFIX = 'cs:';

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function lsSet(key: string, value: unknown): void {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* quota */ }
}

function lsDel(key: string): void {
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* ignore */ }
}

// ── Settings ──────────────────────────────────────────────────────────────────
// All settings (including API keys) are stored exclusively in Cribl's KV store.
// No plaintext sync stores (localStorage, sessionStorage, window.name) are used.

function nonEmpty(s: Partial<Settings> | null): s is Partial<Settings> {
  return s !== null && Object.keys(s).length > 0;
}

export async function loadSettings(): Promise<Partial<Settings>> {
  const kv = await kvGet<Partial<Settings>>('settings/config');
  return nonEmpty(kv) ? kv! : {};
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  await kvSet('settings/config', settings);
}

// ── Projects ──────────────────────────────────────────────────────────────────
// KV store is authoritative. localStorage is a fast local cache.
//
// KV layout:
//   projects/index      → ProjectMeta[]   (master list — avoids kvListKeys dependency)
//   projects/{id}/meta  → ProjectMeta
//   projects/{id}/chat  → ChatMessage[]
//   projects/{id}/files → ProjectFiles    (all files as one blob)
//
// localStorage cache layout:
//   cs:projects          → ProjectMeta[]
//   cs:messages:{id}     → ChatMessage[]
//   cs:files:{id}        → ProjectFiles

async function loadIndex(): Promise<ProjectMeta[]> {
  // Try the fast index key first
  const kv = await kvGet<ProjectMeta[]>('projects/index');
  if (kv && Array.isArray(kv) && kv.length > 0) {
    lsSet('projects', kv);
    return kv;
  }

  // Migration: no index yet — discover existing meta keys via kvListKeys and build it
  const keys = await kvListKeys('projects/');
  const metaKeys = keys.filter(k => k.endsWith('/meta'));
  if (metaKeys.length > 0) {
    const metas = await Promise.all(metaKeys.map(k => kvGet<ProjectMeta>(k)));
    const valid = metas.filter((m): m is ProjectMeta => !!m && !!m.id);
    if (valid.length > 0) {
      await saveIndex(valid);
      return valid.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }

  // Final fallback: localStorage cache
  return lsGet<ProjectMeta[]>('projects') ?? [];
}

async function saveIndex(metas: ProjectMeta[]): Promise<void> {
  const sorted = [...metas].sort((a, b) => b.updatedAt - a.updatedAt);
  lsSet('projects', sorted);
  await kvSet('projects/index', sorted);
}

export async function listProjectMetas(): Promise<ProjectMeta[]> {
  return loadIndex();
}

export async function saveProjectMeta(meta: ProjectMeta): Promise<void> {
  const existing = await loadIndex();
  const updated = existing.filter(p => p.id !== meta.id);
  updated.unshift(meta);
  await saveIndex(updated);
  await kvSet(`projects/${meta.id}/meta`, meta);
}

export async function deleteProject(id: string): Promise<void> {
  const existing = await loadIndex();
  await saveIndex(existing.filter(p => p.id !== id));

  lsDel(`messages:${id}`);
  lsDel(`files:${id}`);

  await Promise.all([
    kvDelete(`projects/${id}/meta`),
    kvDelete(`projects/${id}/chat`),
    kvDelete(`projects/${id}/files`),
  ]);
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export async function loadMessages(projectId: string): Promise<ChatMessage[]> {
  const kv = await kvGet<ChatMessage[]>(`projects/${projectId}/chat`);
  if (kv) {
    lsSet(`messages:${projectId}`, kv);
    return kv;
  }
  return lsGet<ChatMessage[]>(`messages:${projectId}`) ?? [];
}

export async function saveMessages(projectId: string, messages: ChatMessage[]): Promise<void> {
  lsSet(`messages:${projectId}`, messages);
  await kvSet(`projects/${projectId}/chat`, messages);
}

// ── Files ─────────────────────────────────────────────────────────────────────
// All project files are stored as a single JSON blob under one KV key.
// Key: projects/{id}/files  →  ProjectFiles  { "src/App.tsx": "...", ... }

export async function loadProjectFiles(projectId: string): Promise<ProjectFiles> {
  const kv = await kvGet<ProjectFiles>(`projects/${projectId}/files`);
  if (kv && Object.keys(kv).length > 0) {
    lsSet(`files:${projectId}`, kv);
    return kv;
  }
  return lsGet<ProjectFiles>(`files:${projectId}`) ?? {};
}

async function saveAllFiles(projectId: string, files: ProjectFiles): Promise<void> {
  lsSet(`files:${projectId}`, files);
  await kvSet(`projects/${projectId}/files`, files);
}

// Saves the complete files map in a single KV write. Use this when writing
// multiple files at once to avoid race conditions from parallel saveFile calls.
export async function saveProjectFiles(projectId: string, files: ProjectFiles): Promise<void> {
  await saveAllFiles(projectId, files);
}

export async function saveFile(projectId: string, path: string, content: string): Promise<void> {
  const existing = lsGet<ProjectFiles>(`files:${projectId}`) ?? {};
  existing[path] = content;
  await saveAllFiles(projectId, existing);
}

export async function deleteFile(projectId: string, path: string): Promise<void> {
  const existing = lsGet<ProjectFiles>(`files:${projectId}`) ?? {};
  delete existing[path];
  await saveAllFiles(projectId, existing);
}
