'use strict'

/**
 * The only bridge between renderer and main.
 *
 * Exposes a single narrow call rather than any part of `ipcRenderer`, so the
 * renderer cannot reach arbitrary channels. `src/api/transport.ts` feature
 * -detects this object to decide whether it is running in the desktop app.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('netsentry', {
  isDesktop: true,

  /**
   * @param {string} endpoint Engine base URL.
   * @param {string} path Route beginning with "/".
   * @param {{method?: string, headers?: Record<string,string>, body?: string}} [init]
   * @returns {Promise<{ok: boolean, status: number|null, body: unknown}>}
   */
  request: (endpoint, path, init) =>
    ipcRenderer.invoke('netsentry:request', { endpoint, path, init }),
})
