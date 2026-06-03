import JSZip from 'jszip';
import type { ProjectFiles, ProjectMeta } from '../types';
import { bundleFiles } from './bundler/esbuild';

/**
 * Build a .crbl zip matching the structure produced by `npm run package`:
 *   default/  → metadata files (package.json, config/, AGENTS.md)
 *   static/   → compiled output (JS bundle, index.html, assets)
 */
export async function buildCrbl(meta: ProjectMeta, files: ProjectFiles): Promise<Blob> {
  const zip = new JSZip();

  // --- default/ folder: app metadata & config ---
  const appName = meta.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const packageJson = {
    name: appName,
    version: '1.0.0',
    description: meta.description || meta.name,
    cribl: { appType: 'ui' },
  };
  zip.file('default/package.json', JSON.stringify(packageJson, null, 2));

  // Include config files (proxies.yml etc.)
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('config/')) {
      zip.file(`default/${path}`, content);
    }
  }

  // Include AGENTS.md if present
  if (files['AGENTS.md']) {
    zip.file('default/AGENTS.md', files['AGENTS.md']);
  }

  // --- static/ folder: bundled app ---
  const { code: bundleText, error } = await bundleFiles(files);
  if (error) {
    throw new Error(`Bundle failed: ${error}`);
  }

  // Build index.html for the static bundle
  const indexHtml = buildIndexHtml(appName, files['index.html']);
  zip.file('static/index.html', indexHtml);
  zip.file('static/assets/index.js', bundleText);

  // Include any CSS files
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.css') && !path.startsWith('config/')) {
      zip.file(`static/assets/${path.replace('src/', '')}`, content);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function buildIndexHtml(appName: string, existingHtml?: string): string {
  if (existingHtml) {
    // Replace any dev script tag with production bundle reference
    return existingHtml
      .replace(/<script type="module" src="[^"]*"[^>]*><\/script>/, '<script type="module" src="/assets/index.js"></script>');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/index.js"></script>
</body>
</html>`;
}
