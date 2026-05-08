const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const isDev = process.env.VITE_DEV_SERVER_URL
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'target'])

async function buildFileTree(rootPath, currentPath = rootPath, depth = 0) {
  if (depth > 6) return []

  const entries = await fs.readdir(currentPath, { withFileTypes: true })
  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith('.') || entry.name === '.gitignore')
    .filter((entry) => !(entry.isDirectory() && IGNORED_DIRS.has(entry.name)))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))

  return Promise.all(
    visibleEntries.map(async (entry) => {
      const entryPath = path.join(currentPath, entry.name)
      const isDirectory = entry.isDirectory()

      return {
        id: entryPath,
        name: entry.name,
        path: entryPath,
        type: isDirectory ? 'directory' : 'file',
        children: isDirectory ? await buildFileTree(rootPath, entryPath, depth + 1) : undefined,
      }
    }),
  )
}

async function initAndLoadProject(projectPath) {
  const gitPath = path.join(projectPath, '.git')

  try {
    await fs.access(gitPath)
  } catch {
    await execFileAsync('git', ['init'], { cwd: projectPath })
  }

  return {
    name: path.basename(projectPath),
    path: projectPath,
    tree: await buildFileTree(projectPath),
  }
}

function registerIpc() {
  ipcMain.handle('project:create', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a project folder',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    return initAndLoadProject(result.filePaths[0])
  })

  ipcMain.handle('project:open', async (_event, projectPath) => initAndLoadProject(projectPath))

  ipcMain.handle('file:read', async (_event, filePath) => {
    const stat = await fs.stat(filePath)

    if (stat.size > 1024 * 1024) {
      return { path: filePath, content: 'File is too large to preview.', isBinary: false }
    }

    const buffer = await fs.readFile(filePath)
    const isBinary = buffer.includes(0)

    return {
      path: filePath,
      content: isBinary ? 'Binary file preview is not supported.' : buffer.toString('utf8'),
      isBinary,
    }
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Miyagi',
    backgroundColor: '#181818',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
