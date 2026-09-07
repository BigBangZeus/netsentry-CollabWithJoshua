'use strict'

/**
 * Electron main process: window lifecycle only.
 *
 * Engine traffic is handled by `engine-ipc.cjs`, which the renderer reaches
 * through the narrow bridge in `preload.cjs`.
 */

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const { registerEngineIpc } = require('./engine-ipc.cjs')

// `electron .` from the repo is always development; a packaged build is not.
// This avoids needing a cross-platform env-var shim in the npm scripts.
const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#081215',
    title: 'NETSENTRY Console',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Avoid a white flash before the dark UI paints.
  window.once('ready-to-show', () => window.show())

  // External links open in the real browser, never in an app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void window.loadURL(DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  return window
}

app.whenReady().then(() => {
  registerEngineIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
