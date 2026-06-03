import type { Settings, ProjectMeta, ChatMessage, ProjectFiles } from '../types';

declare const CRIBL_API_URL: string;

function base(): string {
  return (window as unknown as { CRIBL_API_URL?: string }).CRIBL_API_URL
    ?? (typeof CRIBL_API_URL !== 'undefined' ? CRIBL_API_URL : '/api/v1');
}

async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`${base()}/kvstore/${key}`);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await fetch(`${base()}/kvstore/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

async function kvDelete(key: string): Promise<void> {
  await fetch(`${base()}/kvstore/${key}`, { method: 'DELETE' });
}

async function kvListKeys(prefix: string): Promise<string[]> {
  try {
    const res = await fetch(`${base()}/kvstore/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { keys?: string[] };
    return data.keys ?? [];
  } catch {
    return [];
  }
}

// Settings — try every available storage mechanism so at least one survives a refresh.
// Priority:
//   window.name  → survives refresh in ANY sandboxed iframe (frame-level, cleared on tab close)
//   sessionStorage → survives refresh in same-origin iframes
//   localStorage   → survives across sessions in same-origin iframes
//   KV store       → survives across sessions when app is installed inside Cribl

const SETTINGS_KEY = 'cribl-vibe-coder:settings';

function writeWindowName(json: string): void {
  try {
    let bag: Record<string, unknown> = {};
    try { bag = JSON.parse(window.name) as Record<string, unknown>; } catch { /* not JSON */ }
    bag[SETTINGS_KEY] = JSON.parse(json);
    window.name = JSON.stringify(bag);
  } catch { /* ignore */ }
}

function readWindowName(): Partial<Settings> | null {
  try {
    const bag = JSON.parse(window.name) as Record<string, unknown>;
    const val = bag[SETTINGS_KEY];
    if (val && typeof val === 'object') return val as Partial<Settings>;
  } catch { /* ignore */ }
  return null;
}

function writeSync(storage: Storage, value: string): void {
  try { storage.setItem(SETTINGS_KEY, value); } catch { /* ignore */ }
}

function readSync(storage: Storage): Partial<Settings> | null {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : null;
  } catch { return null; }
}

function nonEmpty(s: Partial<Settings> | null): s is Partial<Settings> {
  return s !== null && Object.keys(s).length > 0;
}

export async function loadSettings(): Promise<Partial<Settings>> {
  const wn = readWindowName();
  if (nonEmpty(wn)) { console.debug('[vibe-coder] settings loaded from window.name'); return wn; }
  const ss = readSync(sessionStorage);
  if (nonEmpty(ss)) { console.debug('[vibe-coder] settings loaded from sessionStorage'); return ss; }
  const ls = readSync(localStorage);
  if (nonEmpty(ls)) { console.debug('[vibe-coder] settings loaded from localStorage'); return ls; }
  const kv = await kvGet<Partial<Settings>>('settings/config');
  if (nonEmpty(kv)) { console.debug('[vibe-coder] settings loaded from KV store'); return kv!; }
  console.debug('[vibe-coder] no saved settings found, using defaults');
  return {};
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const json = JSON.stringify(settings);
  writeWindowName(json);
  writeSync(sessionStorage, json);
  writeSync(localStorage, json);
  console.debug('[vibe-coder] settings saved:', settings.provider, '/ key present:', !!settings.anthropicApiKey);
  await kvSet('settings/config', settings).catch(e => console.warn('[vibe-coder] KV store save failed:', e));
}

// Projects

export async function listProjectMetas(): Promise<ProjectMeta[]> {
  const keys = await kvListKeys('projects/');
  const metaKeys = keys.filter(k => k.endsWith('/meta'));
  const metas = await Promise.all(metaKeys.map(k => kvGet<ProjectMeta>(k)));
  return (metas.filter(Boolean) as ProjectMeta[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProjectMeta(id: string): Promise<ProjectMeta | null> {
  return kvGet<ProjectMeta>(`projects/${id}/meta`);
}

export async function saveProjectMeta(meta: ProjectMeta): Promise<void> {
  await kvSet(`projects/${meta.id}/meta`, meta);
}

export async function deleteProject(id: string): Promise<void> {
  const keys = await kvListKeys(`projects/${id}/`);
  await Promise.all(keys.map(k => kvDelete(k)));
}

// Chat messages

export async function loadMessages(projectId: string): Promise<ChatMessage[]> {
  return (await kvGet<ChatMessage[]>(`projects/${projectId}/chat`)) ?? [];
}

export async function saveMessages(projectId: string, messages: ChatMessage[]): Promise<void> {
  await kvSet(`projects/${projectId}/chat`, messages);
}

// Files — stored one key per file to stay within KV value size limits

export async function loadProjectFiles(projectId: string): Promise<ProjectFiles> {
  const prefix = `projects/${projectId}/files/`;
  const keys = await kvListKeys(prefix);
  const entries = await Promise.all(
    keys.map(async k => {
      const content = await kvGet<string>(k);
      const path = k.slice(prefix.length);
      return [path, content ?? ''] as [string, string];
    }),
  );
  return Object.fromEntries(entries);
}

export async function saveFile(projectId: string, path: string, content: string): Promise<void> {
  await kvSet(`projects/${projectId}/files/${path}`, content);
}

export async function deleteFile(projectId: string, path: string): Promise<void> {
  await kvDelete(`projects/${projectId}/files/${path}`);
}
