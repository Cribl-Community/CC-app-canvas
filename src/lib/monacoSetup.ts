import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// By default @monaco-editor/react injects a <script> tag pointing to cdn.jsdelivr.net
// to load Monaco at runtime. Cribl's sandbox CSP only allows 'self' scripts, so that
// request is blocked. Calling loader.config({ monaco }) here tells the loader to use
// the already-imported (Vite-bundled) monaco-editor package instead of fetching from CDN.
// Must be called once before any <MonacoEditor /> component renders.
loader.config({ monaco });
