import type { ProjectFiles } from '../../types';

// Served from public/vendor/ — same origin, no CDN, no CSP issues, no version drift.
// Run `node scripts/copy-esbuild-wasm.mjs` (or `npm install`) to refresh these files.
// import.meta.env.BASE_URL handles both local dev ('/') and Cribl sub-path deploys ('./').
// Relative to the page — fetch() resolves this against window.location, so
// both local dev ('/vendor/esbuild.wasm') and deployed sub-paths work correctly.
const ESBUILD_WASM_URL = `${import.meta.env.BASE_URL}vendor/esbuild.wasm`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EsbuildModule = any;

let esbuildMod: EsbuildModule | null = null;
let initPromise: Promise<EsbuildModule> | null = null;

async function ensureInitialized(): Promise<EsbuildModule> {
  if (esbuildMod) return esbuildMod;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // esbuild-wasm is preloaded by a <script type="module"> in index.html which imports
    // ./vendor/esbuild-wasm.js and stores it on window.__criblStudioEsbuild.
    //
    // Using a <script> tag (rather than a programmatic import()) is the only approach that
    // works in Cribl's null-origin sandboxed iframe: the browser resolves the URL against the
    // document URL (not the null origin), so it succeeds. Programmatic import() of blob:null/
    // URLs is blocked by Chrome/Safari in null-origin contexts.
    const esb = await new Promise<EsbuildModule>((resolve, reject) => {
      const w = window as Window & { __criblStudioEsbuild?: EsbuildModule };
      if (w.__criblStudioEsbuild) {
        resolve(w.__criblStudioEsbuild);
        return;
      }
      const timeout = setTimeout(
        () => reject(new Error('esbuild-wasm preload timed out after 10s — check that vendor/esbuild-wasm.js was copied (run npm install)')),
        10_000
      );
      document.addEventListener('esbuild-ready', () => {
        clearTimeout(timeout);
        resolve(w.__criblStudioEsbuild);
      }, { once: true });
    });

    // Compile the WASM ourselves and pass it via wasmModule so esbuild never tries
    // to make its own HTTP request for the WASM file from a potentially restricted context.
    const wasmRes = await fetch(ESBUILD_WASM_URL);
    if (!wasmRes.ok) throw new Error(`Failed to fetch esbuild WASM: ${wasmRes.status} ${ESBUILD_WASM_URL}`);
    const wasmModule = await WebAssembly.compileStreaming(wasmRes);

    await esb.initialize({ wasmModule, worker: false });
    esbuildMod = esb;
    return esb;
  })();

  return initPromise;
}

// Pre-warm on import
ensureInitialized().catch(() => { /* will retry on first bundle call */ });

const ESM_SH = 'https://esm.sh';

/** Bundle a virtual file system (path → content map) into a self-contained JS string. */
export async function bundleFiles(files: ProjectFiles): Promise<{ code: string; error?: string }> {
  try {
    const esbuild = await ensureInitialized();

    // Determine entry point
    const entryPoint = files['src/main.tsx']
      ? 'src/main.tsx'
      : files['src/main.ts']
        ? 'src/main.ts'
        : files['src/index.tsx']
          ? 'src/index.tsx'
          : Object.keys(files)[0];

    if (!entryPoint) {
      return { code: '', error: 'No entry point found in generated files.' };
    }

    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'esm',
      jsx: 'automatic',
      target: 'es2020',
      plugins: [virtualFilePlugin(files)],
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    if (result.errors.length > 0) {
      const errText = result.errors.map((e: { text: string }) => e.text).join('\n');
      return { code: '', error: errText };
    }

    const code = result.outputFiles[0].text;
    return { code };
  } catch (e) {
    return { code: '', error: String(e) };
  }
}

interface EsbuildPluginBuild {
  onResolve: (
    options: { filter: RegExp },
    callback: (args: { path: string; importer: string; namespace: string }) => unknown,
  ) => void;
  onLoad: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: { path: string }) => unknown,
  ) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function virtualFilePlugin(files: ProjectFiles): any {
  return {
    name: 'virtual-fs',
    setup(build: EsbuildPluginBuild) {
      // Resolve virtual files
      build.onResolve({ filter: /.*/ }, (args: { path: string; importer: string; namespace: string }) => {
        if (args.importer === '') {
          return { path: args.path, namespace: 'virtual' };
        }

        // Absolute-path imports from CDN files (e.g. /react@19.2.7/es2022/react.mjs from esm.sh)
        if (args.namespace === 'cdn' && args.path.startsWith('/')) {
          return { path: `${ESM_SH}${args.path}`, namespace: 'cdn' };
        }

        // Relative imports from CDN files
        if (args.namespace === 'cdn' && args.path.startsWith('.')) {
          try {
            const resolved = new URL(args.path, args.importer).href;
            return { path: resolved, namespace: 'cdn' };
          } catch {
            return null;
          }
        }

        // Relative imports from virtual files
        if (args.path.startsWith('.') && args.namespace === 'virtual') {
          const base = args.importer.replace(/\/[^/]+$/, '');
          const normalized = normalizePath(`${base}/${args.path}`);
          const resolved = resolveWithExtensions(normalized, files);
          if (resolved) return { path: resolved, namespace: 'virtual' };
        }

        // Absolute virtual paths
        const abs = resolveWithExtensions(args.path, files);
        if (abs) return { path: abs, namespace: 'virtual' };

        // npm package names → esm.sh CDN
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return { path: `${ESM_SH}/${args.path}`, namespace: 'cdn' };
        }

        return null;
      });

      // Load virtual files
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args: { path: string }) => {
        const content = files[args.path];
        if (content === undefined) return null;
        const ext = args.path.split('.').pop() ?? '';

        // CSS: inject as a <style> tag at runtime instead of a separate output file
        if (ext === 'css') {
          const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
          return {
            contents: `(function(){var s=document.createElement('style');s.textContent=\`${escaped}\`;document.head.appendChild(s);})();`,
            loader: 'js',
          };
        }

        const loaderMap: Record<string, string> = {
          tsx: 'tsx', ts: 'ts', jsx: 'jsx', js: 'js',
          json: 'json', svg: 'text',
        };
        return { contents: content, loader: loaderMap[ext] ?? 'js' };
      });

      // Load CDN packages
      build.onLoad({ filter: /.*/, namespace: 'cdn' }, async (args: { path: string }) => {
        const res = await fetch(args.path);
        if (!res.ok) throw new Error(`Failed to fetch ${args.path}: ${res.status}`);
        const text = await res.text();
        return { contents: text, loader: 'js' };
      });
    },
  };
}

function normalizePath(path: string): string {
  const parts = path.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else if (part !== '.') result.push(part);
  }
  return result.join('/');
}

function resolveWithExtensions(path: string, files: ProjectFiles): string | null {
  const exts = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js'];
  for (const ext of exts) {
    const full = path + ext;
    if (full in files) return full;
  }
  return null;
}
