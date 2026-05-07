import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { saveKey, getKey, deleteKey, hasKey, listKeys } from './keychain.js'

function checkUrl(url: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    let request: Electron.ClientRequest | null = null
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => {
      try {
        request?.abort()
      } catch {
        // Ignore abort races while probing startup readiness.
      }
      finish(false)
    }, timeoutMs)

    try {
      request = net.request(url)
      request.on('response', () => finish(true))
      request.on('error', () => finish(false))
      request.end()
    } catch {
      finish(false)
    }
  })
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const PORT = 3400

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcessWithoutNullStreams | null = null

// --- Single instance lock ---
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

// --- Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#000000',
    icon: isDev
      ? path.join(__dirname, '..', 'build', 'icon.icns')
      : path.join(process.resourcesPath, 'build', 'icon.icns'),
    webPreferences: {
      preload: isDev
        ? path.join(__dirname, '..', 'dist-electron', 'preload.js')
        : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the app
  if (isDev) {
    const viteUrl = 'http://localhost:5173'
    const waitAndLoad = async () => {
      for (let i = 0; i < 60; i++) {
        if (await checkUrl(viteUrl)) break
        await new Promise(r => setTimeout(r, 500))
      }
      console.log('Loading Vite dev server...')
      mainWindow?.loadURL(viteUrl)
    }
    waitAndLoad()
  } else {
    const expressUrl = `http://localhost:${PORT}`
    const waitAndLoad = async () => {
      for (let i = 0; i < 60; i++) {
        if (await checkUrl(expressUrl)) break
        await new Promise(r => setTimeout(r, 500))
      }
      console.log('Loading Express server...')
      mainWindow?.loadURL(expressUrl)
    }
    waitAndLoad()
  }

  mainWindow.on('close', (e) => {
    // Don't quit — hide to tray
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// --- Tray ---
function createTray() {
  const trayIconPath = isDev
    ? path.join(__dirname, '..', 'build', 'trayTemplate.png')
    : path.join(process.resourcesPath, 'build', 'trayTemplate.png')

  const icon = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(icon)
  tray.setToolTip('Forge')

  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

function updateTrayMenu() {
  const lanIP = getLanIP()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Forge',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: mainWindow?.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: `MCP Server: Running (port ${PORT})`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Open in Browser`,
      click: () => shell.openExternal(`http://localhost:${PORT}`),
    },
    {
      label: `Copy LAN IP (${lanIP}:${PORT})`,
      click: () => {
        const { clipboard } = require('electron')
        clipboard.writeText(`http://${lanIP}:${PORT}`)
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Forge',
      click: () => {
        (app as any).isQuitting = true
        app.quit()
      },
    },
  ])

  tray?.setContextMenu(contextMenu)
}

function getLanIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

async function startProductionServer(): Promise<void> {
  if (await checkUrl(`http://localhost:${PORT}/api/health`, 750)) {
    console.log('Forge server already running on port', PORT)
    return
  }

  const serverPath = path.join(__dirname, 'server.mjs')
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      FORGE_PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      console.log(`[Forge server] ${line}`)
    }
  })

  serverProcess.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      console.error(`[Forge server] ${line}`)
    }
  })

  serverProcess.on('exit', (code, signal) => {
    console.log(`Forge server exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`)
    serverProcess = null
  })

  for (let i = 0; i < 45; i++) {
    if (await checkUrl(`http://localhost:${PORT}/api/health`, 750)) {
      console.log('Forge server started on port', PORT)
      return
    }
    await new Promise(r => setTimeout(r, 250))
  }

  throw new Error(`Forge server did not become healthy on port ${PORT}`)
}

// --- Auto-start as login item ---
function setupLoginItem() {
  if (!isDev) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    })
  }
}

// --- App lifecycle ---
app.on('ready', async () => {
  setupLoginItem()

  // Keychain IPC
  ipcMain.handle('keychain:save', (_e, service: string, value: string) => saveKey(service, value))
  ipcMain.handle('keychain:get', (_e, service: string) => getKey(service))
  ipcMain.handle('keychain:delete', (_e, service: string) => deleteKey(service))
  ipcMain.handle('keychain:has', (_e, service: string) => hasKey(service))
  ipcMain.handle('keychain:list', () => listKeys())

  // Start Express server FIRST in production (before creating window)
  if (!isDev) {
    try {
      await startProductionServer()
    } catch (err) {
      console.error('Failed to start server:', err)
    }
  }

  createWindow()
  createTray()

  // Update tray menu periodically
  setInterval(updateTrayMenu, 30000)
})

app.on('window-all-closed', () => {
  // Don't quit on macOS — keep running in tray
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
})

app.on('before-quit', () => {
  (app as any).isQuitting = true
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
  }
})
