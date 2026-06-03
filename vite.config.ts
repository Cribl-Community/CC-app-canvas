import { defineConfig, type IndexHtmlTransformContext, type IndexHtmlTransformResult, type ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'path'
import react from '@vitejs/plugin-react'
// @ts-ignore
import { servePackageTgz } from './scripts/pkgutil.mjs'

const packageEndpointPlugin = () => ({
  name: 'vite-plugin-package-endpoint',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/package.tgz', (req: IncomingMessage, res: ServerResponse) => {
      void servePackageTgz(req, res, server.config.root)
    })
  },
})

const injectScriptFromQueryPlugin = () => {
  let initScriptUrl: string | null = null;
  return {
    name: 'inject-script-from-query',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      server.watcher.add([
        join(root, 'package.json'),
        join(root, 'config', 'proxies.yml'),
      ]);
      server.watcher.on('change', (file) => {
        if (file === join(root, 'package.json') || file === join(root, 'config', 'proxies.yml')) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
    transformIndexHtml(html: string, ctx: IndexHtmlTransformContext): IndexHtmlTransformResult{
      const url = new URL(ctx.originalUrl ?? '/', 'https://localhost');
      initScriptUrl = initScriptUrl || url.searchParams.get('init');
      const root = process.cwd();
      let appName;
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { name?: string };
        appName = pkg.name;
      } catch {
        /* ignore missing or invalid package.json */
      }
      appName = appName || 'unknown';
      const tags: Array<{ tag: string; attrs?: Record<string, string>; children?: string; injectTo: 'head-prepend' }> = [];
      tags.push({
        tag: 'script',
        children: `window.CRIBL_APP_ID = '__dev__${appName}';`,
        injectTo: 'head-prepend' as const,
      });
      if (initScriptUrl) {
        tags.push({
          tag: 'script',
          attrs: { src: initScriptUrl, type: 'text/javascript' },
          injectTo: 'head-prepend' as const,
        });
      }
      return { html, tags };
    },
  };
};

// Optional: point local dev at a real Cribl instance.
// Create .env.local and set:
//   VITE_CRIBL_PROXY_TARGET=https://your-instance.cribl-staging.cloud
//   VITE_CRIBL_AUTH_TOKEN=<Bearer token from the staging UI>
// Requests to /api/v1/* will be forwarded to that host with the auth header injected.
const criblProxyTarget = process.env.VITE_CRIBL_PROXY_TARGET;
const criblAuthToken   = process.env.VITE_CRIBL_AUTH_TOKEN;

export default defineConfig({
  plugins: [react(), packageEndpointPlugin(), injectScriptFromQueryPlugin()],
  base: './',
  server: {
    cors: true,
    ...(criblProxyTarget ? {
      proxy: {
        '/api/v1': {
          target: criblProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err) => console.warn('[vite-proxy] error:', err.message));
            proxy.on('proxyReq', (proxyReq, req) => {
              if (criblAuthToken) proxyReq.setHeader('Authorization', criblAuthToken);
              console.debug('[vite-proxy] →', req.method, req.url);
            });
          },
        },
      },
    } : {}),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // esbuild-wasm is large; don't warn on its chunk size
    chunkSizeWarningLimit: 5000,
  },
  optimizeDeps: {
    // esbuild-wasm is loaded manually from public/vendor/, not imported as a module
    exclude: ['esbuild-wasm'],
  },
})

