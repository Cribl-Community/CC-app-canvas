import type { ProjectFiles, ProjectMeta } from '../types';
import { bundleFiles } from './bundler/esbuild';
import openApiCurated from '../openapi-curated.json';

const CRIBL_CREATE_APP_SCRIPT_VERSION = '0.1.0';

// ─── Minimal in-browser tar.gz builder ───────────────────────────────────────
// Cribl's app installer expects a POSIX tar.gz, not a zip. We build it
// manually using the ustar header format and compress with CompressionStream.
//
// Paths use the same "./prefix" and explicit directory entries that
// `tar -czf - -C package-build .` produces, which the Cribl installer expects.

class TarBuilder {
  private readonly BLOCK = 512;
  private chunks: Uint8Array[] = [];
  private enc = new TextEncoder();
  private dirs = new Set<string>();

  addFile(name: string, content: string | Uint8Array) {
    // Normalise: always use "./path/to/file" prefix
    const entry = name.startsWith('./') ? name : `./${name}`;

    // Ensure parent directory entries exist first
    const parts = entry.split('/');
    for (let i = 1; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join('/') + '/';
      if (!this.dirs.has(dir)) {
        this.dirs.add(dir);
        this.chunks.push(this.makeHeader(dir, 0, true));
        // Dirs have no data blocks
      }
    }

    const data = typeof content === 'string' ? this.enc.encode(content) : content;
    this.chunks.push(this.makeHeader(entry, data.length, false));

    const padded = new Uint8Array(Math.ceil(data.length / this.BLOCK) * this.BLOCK);
    padded.set(data);
    this.chunks.push(padded);
  }

  private makeHeader(name: string, size: number, isDir: boolean): Uint8Array {
    const h = new Uint8Array(this.BLOCK);
    const ws = (str: string, off: number, len: number) => {
      const b = this.enc.encode(str);
      h.set(b.subarray(0, Math.min(b.length, len)), off);
    };

    ws(name,                                                    0,   100); // name
    ws(isDir ? '0000755\0' : '0000644\0',                     100,  8);   // mode
    ws('0000000\0',                                            108,  8);   // uid
    ws('0000000\0',                                            116,  8);   // gid
    ws(size.toString(8).padStart(11, '0') + '\0',             124, 12);   // size
    ws(Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0', 136, 12); // mtime
    h.fill(0x20, 148, 156);                                               // checksum (spaces)
    h[156] = isDir ? 0x35 : 0x30;                                         // typeflag
    ws('ustar',  257, 5);
    ws('00',     263, 2);

    // Compute checksum over all 512 bytes (checksum field treated as spaces)
    let sum = 0;
    for (const b of h) sum += b;
    ws(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);

    return h;
  }

  async build(): Promise<Blob> {
    // Root directory entry
    if (!this.dirs.has('./')) {
      this.chunks.unshift(this.makeHeader('./', 0, true));
    }

    // End-of-archive: two 512-byte null blocks
    this.chunks.push(new Uint8Array(this.BLOCK));
    this.chunks.push(new Uint8Array(this.BLOCK));

    const totalLen = this.chunks.reduce((n, c) => n + c.length, 0);
    const tar = new Uint8Array(totalLen);
    let off = 0;
    for (const c of this.chunks) { tar.set(c, off); off += c.length; }

    // Gzip via CompressionStream (available in all modern browsers)
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(tar);
    void writer.close();

    const parts: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as Uint8Array);
    }

    return new Blob(parts.map(p => p.buffer as ArrayBuffer), { type: 'application/gzip' });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a .tgz matching the structure produced by `npm run package`:
 *
 *   package.json          ← root (name, version, displayName, cribl metadata)
 *   default/
 *     proxies.yml         ← external domain allow-list
 *   static/
 *     index.html          ← entry point
 *     vendor/
 *       tailwind.js       ← vendored Tailwind CDN (no external requests at runtime)
 *     assets/
 *       index.js          ← self-contained esbuild bundle
 */
export async function buildCrbl(meta: ProjectMeta, files: ProjectFiles): Promise<Blob> {
  const tar = new TarBuilder();
  const appName = meta.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'app';

  // ── package.json at archive root ──────────────────────────────────────────
  const packageJson = {
    name: appName,
    version: '1.0.0',
    displayName: meta.name,
    description: meta.description || meta.name,
    cribl: {
      type: 'app',
      createAppScriptVersion: CRIBL_CREATE_APP_SCRIPT_VERSION,
    },
  };
  tar.addFile('package.json', JSON.stringify(packageJson, null, 2));

  // ── default/proxies.yml ───────────────────────────────────────────────────
  const proxiesYml = `# External domains the app may access at runtime
cdn.tailwindcss.com:
  timeout: 30000
`;
  tar.addFile('default/proxies.yml', proxiesYml);

  // ── Bundle the generated app ──────────────────────────────────────────────
  const { code: bundleText, error } = await bundleFiles(files);
  if (error) throw new Error(`Bundle failed: ${error}`);
  tar.addFile('static/assets/index.js', bundleText);

  // ── Fetch vendored Tailwind and inline it so the package is self-contained ──
  // Using a relative path avoids the Cribl proxy rewriting absolute https://
  // URLs as external proxy requests (which would fail since the Cribl domain
  // itself isn't in proxies.yml).
  let tailwindJs = '';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}vendor/tailwind.js`);
    if (res.ok) tailwindJs = await res.text();
  } catch { /* fall back to CDN below */ }

  // ── static/index.html ─────────────────────────────────────────────────────
  // Inline tailwind.js directly — eliminates path-resolution and CSP issues
  // in the installed app's iframe.
  const tailwindScript = tailwindJs
    ? `<script>${tailwindJs}</script>`
    : '<script src="https://cdn.tailwindcss.com"></script>';

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.name}</title>
  ${tailwindScript}
  <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./assets/index.js"></script>
</body>
</html>`;
  tar.addFile('static/index.html', indexHtml);

  return tar.build();
}

// ─── Source download ──────────────────────────────────────────────────────────

/**
 * Build a raw-source .tgz that can be opened locally with `npm install && npm run dev`.
 *
 * Structure:
 *   package.json       ← Vite + React + TypeScript scaffold
 *   tsconfig.json
 *   vite.config.ts
 *   index.html         ← Tailwind via CDN, mounts /src/main.tsx
 *   src/               ← all AI-generated files exactly as-is
 *     main.tsx
 *     App.tsx
 *     ...
 */
export async function buildSourceTgz(meta: ProjectMeta, files: ProjectFiles): Promise<Blob> {
  const tar = new TarBuilder();
  const appName = meta.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'app';

  // ── package.json ──────────────────────────────────────────────────────────
  const packageJson = {
    name: appName,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/react': '^18.3.1',
      '@types/react-dom': '^18.3.1',
      '@vitejs/plugin-react': '^4.3.1',
      typescript: '~5.6.2',
      vite: '^6.0.0',
    },
  };
  tar.addFile('package.json', JSON.stringify(packageJson, null, 2));

  // ── tsconfig.json ─────────────────────────────────────────────────────────
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
  };
  tar.addFile('tsconfig.json', JSON.stringify(tsconfig, null, 2));

  // ── vite.config.ts ────────────────────────────────────────────────────────
  tar.addFile('vite.config.ts', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`);

  // ── index.html ────────────────────────────────────────────────────────────
  tar.addFile('index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${meta.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

  // ── README.md ─────────────────────────────────────────────────────────────
  tar.addFile('README.md', `# ${meta.name}

Generated by [Cribl Studio](https://github.com/cribl/cribl-studio).

## Getting started

\`\`\`bash
npm install
npm run dev
\`\`\`
`);

  // ── openapi.json — Cribl REST API spec for AI coding tools ───────────────
  tar.addFile('openapi.json', JSON.stringify(openApiCurated, null, 2));

  // ── Generated source files ────────────────────────────────────────────────
  for (const [path, content] of Object.entries(files)) {
    tar.addFile(path, content);
  }

  return tar.build();
}
