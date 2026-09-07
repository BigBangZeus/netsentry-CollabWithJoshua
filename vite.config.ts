import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

/** Where the Flask engine listens, per its own README. */
const ENGINE_TARGET = process.env.VITE_ENGINE_TARGET ?? 'http://127.0.0.1:8086'

/**
 * Injects a Content-Security-Policy meta tag.
 *
 * Electron warns loudly about a renderer with no policy, and the warning is
 * fair: without one, any injected markup could load remote code. The dev
 * policy has to permit eval and the HMR websocket, so the two builds get
 * different policies rather than shipping the looser one.
 */
function csp(): Plugin {
  return {
    name: 'netsentry-csp',

    transformIndexHtml(_html, ctx) {
      const dev = !ctx.bundle

      const policy = [
        "default-src 'self'",
        dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
        // React sets inline style attributes throughout the UI.
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data:",
        // Web build talks to a local engine directly; dev also needs the HMR socket.
        dev
          ? "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
          : "connect-src 'self' http://127.0.0.1:* http://localhost:*",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        // frame-ancestors is ignored in a meta tag; it only works as a header.
        // Nothing frames this app (file:// in Electron, local dev otherwise).
      ].join('; ')

      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), csp()],

  // Relative asset paths so the packaged Electron build loads over file://.
  base: './',

  server: {
    port: 5173,
    proxy: {
      /**
       * The engine sends no CORS headers, so a browser cannot call it
       * cross-origin — a JSON POST fails at the preflight. Proxying through
       * the dev server makes those calls same-origin. The desktop build does
       * not use this path; it goes through Electron IPC instead.
       */
      '/engine': {
        target: ENGINE_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/engine/, ''),
      },
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
