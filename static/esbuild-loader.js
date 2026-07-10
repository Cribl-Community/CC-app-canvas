// Loaded as a plain <script type="module"> from index.html so the import resolves
// against the document URL (not the null origin). This is the only way to load
// esbuild-wasm in Cribl's sandboxed null-origin iframe — programmatic import() of
// blob:null/ URLs is hard-blocked by Chrome/Safari.
import * as esbuild from './vendor/esbuild-wasm.js';
window.__criblStudioEsbuild = esbuild;
document.dispatchEvent(new Event('esbuild-ready'));
