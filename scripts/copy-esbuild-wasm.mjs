import { copyFileSync, mkdirSync } from 'fs';
import { createWriteStream } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { get } from 'https';

const require = createRequire(import.meta.url);
const pkg = resolve(dirname(require.resolve('esbuild-wasm/package.json')));

mkdirSync('public/vendor', { recursive: true });
copyFileSync(`${pkg}/esm/browser.min.js`, 'public/vendor/esbuild-wasm.js');
copyFileSync(`${pkg}/esbuild.wasm`,       'public/vendor/esbuild.wasm');
console.log('Copied esbuild-wasm assets to public/vendor/');

// Download Tailwind CDN script — follows redirects (cdn.tailwindcss.com uses them).
// The preview srcdoc uses this local copy so no external CDN request is needed
// at runtime, which avoids Cribl's CSP restrictions on staging.
function download(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Resolve relative redirects against the original URL's origin
        const next = new URL(res.headers.location, url).href;
        return download(next, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

await download('https://cdn.tailwindcss.com', 'public/vendor/tailwind.js');
console.log('Downloaded Tailwind CDN to public/vendor/tailwind.js');
