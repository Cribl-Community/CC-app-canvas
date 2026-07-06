import { useEffect, useRef, useState } from 'react';
import type { ProjectFiles } from '../../types';
import { bundleFiles } from '../../lib/bundler/esbuild';

interface Props {
  files: ProjectFiles;
  trigger: number; // increment to force rebundle
  onBuildResult?: (error: string) => void;
}

// postMessage bridge: relay fetch requests from the preview iframe through
// the parent app frame (which has the Cribl platform proxy + auth).
// Two null-origin frames can never directly read each other's properties, but
// postMessage always works across origin boundaries.
function useFetchBridge() {
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (!e.data?.__criblFetchRequest || !e.source) return;
      const { id, url, method, headers, body } = e.data;
      try {
        const res = await fetch(url, { method, headers: headers ?? {}, body: body ?? undefined });
        const text = await res.text();
        (e.source as Window).postMessage({
          __criblFetchResponse: true,
          id, ok: res.ok, status: res.status, statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body: text,
        }, '*');
      } catch (err) {
        (e.source as Window).postMessage({
          __criblFetchResponse: true,
          id, error: err instanceof Error ? err.message : String(err),
        }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
}

export function PreviewPanel({ files, trigger, onBuildResult }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'idle' | 'bundling' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const prevCodeRef = useRef<string>('');

  useFetchBridge();

  // Snapshot CRIBL_API_URL from this frame (set by the Cribl platform) so we
  // can inline it into the preview srcdoc without needing cross-frame access.
  const criblApiUrl = (window as Window & { CRIBL_API_URL?: string }).CRIBL_API_URL ?? '/api/v1';

  // Serve Tailwind from our own origin so the srcdoc <script> tag never makes an
  // external CDN request (blocked by Cribl's CSP on staging).
  // Use new URL() to resolve against window.location.href so the sub-path
  // (/app-ui/cribl-studio/) is included — concatenating origin + BASE_URL loses it.
  const tailwindUrl = new URL(`${import.meta.env.BASE_URL}vendor/tailwind.js`, window.location.href).href;

  // Derive idle status from files to avoid calling setState synchronously in the effect
  const displayStatus = Object.keys(files).length === 0 ? 'idle' : status;

  useEffect(() => {
    if (Object.keys(files).length === 0) {
      return;
    }

    void Promise.resolve().then(() => {
      setStatus('bundling');
      setError('');
    });

    bundleFiles(files).then(({ code, error: bundleError }) => {
      if (bundleError) {
        setStatus('error');
        setError(bundleError);
        onBuildResult?.(bundleError);
        return;
      }

      prevCodeRef.current = code;
      const html = buildPreviewHtml(code, criblApiUrl, tailwindUrl);
      if (iframeRef.current) iframeRef.current.srcdoc = html;
      if (fullscreenIframeRef.current) fullscreenIframeRef.current.srcdoc = html;

      setStatus('ready');
      onBuildResult?.('');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // Keep fullscreen iframe in sync when it opens
  useEffect(() => {
    if (fullscreen && fullscreenIframeRef.current && prevCodeRef.current) {
      fullscreenIframeRef.current.srcdoc = buildPreviewHtml(prevCodeRef.current, criblApiUrl, tailwindUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // Close on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const toolbar = (isFullscreen: boolean) => (
    <div className="preview-toolbar">
      <span className="preview-title">Preview</span>
      {displayStatus === 'bundling' && <span className="preview-status bundling">Building…</span>}
      {displayStatus === 'ready' && <span className="preview-status ready">● Live</span>}
      {displayStatus === 'error' && <span className="preview-status error">● Error</span>}
      <button
        className="icon-btn"
        title="Reload preview"
        onClick={() => {
          const html = prevCodeRef.current ? buildPreviewHtml(prevCodeRef.current, criblApiUrl, tailwindUrl) : '';
          if (iframeRef.current && html) iframeRef.current.srcdoc = html;
          if (fullscreenIframeRef.current && html) fullscreenIframeRef.current.srcdoc = html;
        }}
      >↺</button>
      <button
        className="icon-btn"
        title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'}
        onClick={() => setFullscreen(v => !v)}
      >{isFullscreen ? '✕' : '⤢'}</button>
    </div>
  );

  return (
    <>
    <div className="preview-panel">
      {toolbar(false)}

      {displayStatus === 'idle' && (
        <div className="preview-empty">
          <div className="preview-empty-icon">👁</div>
          <p>Your app preview will appear here once the AI generates it.</p>
        </div>
      )}

      {displayStatus === 'error' && (
        <div className="preview-error">
          <div className="preview-error-title">Build error</div>
          <pre className="preview-error-text">{error}</pre>
        </div>
      )}

      <iframe
        ref={iframeRef}
        className={`preview-iframe ${displayStatus === 'idle' || displayStatus === 'error' ? 'hidden' : ''}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        title="App Preview"
      />
    </div>

    {fullscreen && (
      <div className="preview-fullscreen-backdrop" onClick={() => setFullscreen(false)}>
        <div className="preview-fullscreen-panel" onClick={e => e.stopPropagation()}>
          {toolbar(true)}
          {displayStatus === 'idle' && (
            <div className="preview-empty">
              <div className="preview-empty-icon">👁</div>
              <p>Your app preview will appear here once the AI generates it.</p>
            </div>
          )}
          {displayStatus === 'error' && (
            <div className="preview-error">
              <div className="preview-error-title">Build error</div>
              <pre className="preview-error-text">{error}</pre>
            </div>
          )}
          <iframe
            ref={fullscreenIframeRef}
            className={`preview-iframe ${displayStatus === 'idle' || displayStatus === 'error' ? 'hidden' : ''}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            title="App Preview (fullscreen)"
          />
        </div>
      </div>
    )}
    </>
  );
}

function buildPreviewHtml(bundleCode: string, criblApiUrl: string, tailwindUrl: string): string {
  // Escape </script> inside the bundle so it doesn't break the surrounding HTML
  const safeCode = bundleCode.replace(/<\/script>/gi, '<\\/script>');
  const safeApiUrl = JSON.stringify(criblApiUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="${tailwindUrl}"></script>
  <style>body { margin: 0; font-family: system-ui, sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
  <script>
    // CRIBL_API_URL is inlined from the parent frame at build time — no cross-frame
    // property access needed (which is blocked between null-origin frames).
    window.CRIBL_API_URL = ${safeApiUrl};
    window.CRIBL_BASE_PATH = '/';

    // postMessage-based fetch bridge.
    // Direct property access on window.parent is blocked when both frames have null
    // origin (Cribl's sandbox). postMessage always works across origin boundaries, so
    // we relay fetch calls to the parent app frame (which has the Cribl proxy + auth)
    // and receive the serialised response back.
    (function() {
      var pending = Object.create(null);
      var nextId = 0;
      window.addEventListener('message', function(e) {
        var d = e.data;
        if (!d || !d.__criblFetchResponse) return;
        var p = pending[d.id];
        if (!p) return;
        delete pending[d.id];
        if (d.error) { p.reject(new TypeError(d.error)); return; }
        p.resolve(new Response(d.body, { status: d.status, statusText: d.statusText, headers: d.headers }));
      });
      window.fetch = function(input, init) {
        return new Promise(function(resolve, reject) {
          var id = ++nextId;
          pending[id] = { resolve: resolve, reject: reject };
          var url = (typeof input === 'string') ? input : (input && input.url) ? input.url : String(input);
          var method = (init && init.method) || (input && input.method) || 'GET';
          var hdrs = (init && init.headers) || (input && input.headers) || {};
          // Flatten Headers instance to plain object
          if (typeof hdrs.entries === 'function') {
            var flat = {};
            hdrs.entries().forEach(function(pair) { flat[pair[0]] = pair[1]; });
            hdrs = flat;
          }
          var body = (init && init.body != null) ? init.body : null;
          window.parent.postMessage({ __criblFetchRequest: true, id: id, url: url, method: method, headers: hdrs, body: body }, '*');
        });
      };
    })();

    // Surface runtime errors visibly in the preview
    window.addEventListener('error', function(e) {
      var el = document.getElementById('preview-error');
      if (!el) { el = document.createElement('div'); el.id = 'preview-error'; el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1e1e2e;color:#f38ba8;padding:12px 16px;font:13px/1.5 monospace;white-space:pre-wrap;z-index:9999;border-bottom:2px solid #f38ba8'; document.body.prepend(el); }
      el.textContent = 'Runtime error: ' + e.message + '\\n' + (e.filename ? e.filename + ':' + e.lineno : '');
    });
    window.addEventListener('unhandledrejection', function(e) {
      var el = document.getElementById('preview-error');
      if (!el) { el = document.createElement('div'); el.id = 'preview-error'; el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1e1e2e;color:#f38ba8;padding:12px 16px;font:13px/1.5 monospace;white-space:pre-wrap;z-index:9999;border-bottom:2px solid #f38ba8'; document.body.prepend(el); }
      el.textContent = 'Unhandled rejection: ' + e.reason;
    });
  </script>
  <script type="module">
${safeCode}
  </script>
</body>
</html>`;
}
