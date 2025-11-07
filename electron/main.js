const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
// `get-port` is ESM-only in newer versions; load it dynamically to avoid
// ERR_REQUIRE_ESM when this file is executed as CommonJS by Electron.
let _getPort = null;

async function loadGetPort() {
  if (_getPort) return _getPort;
  const mod = await import('get-port');
  // support both default and named export
  _getPort = mod.default || mod;
  return _getPort;
}

let serverProc = null;
let mainWindow = null;

// IPC: handle download installer request from renderer
ipcMain.handle('app:download-installer', async () => {
  const fs = require('fs').promises;
  const os = require('os');

  // Helper to search a directory for .exe files (non-recursive / shallow)
  async function findExeIn(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
          return path.join(dir, e.name);
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // Candidate locations to look for the built installer (shallow first)
  const candidates = [
    path.join(ROOT, 'dist'),
    path.join(process.resourcesPath || '', 'dist'),
    process.resourcesPath,
    path.join(ROOT, '..', 'dist'),
  ];

  let source = null;
  const tried = [];

  // shallow search first
  for (const c of candidates) {
    tried.push(c);
    const found = await findExeIn(c);
    if (found) { source = found; break; }
  }

  // If not found, try a recursive search (depth-limited) inside candidates
  async function findExeRecursive(dir, depth = 3) {
    try {
      if (depth < 0) return null;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) return full;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          const full = path.join(dir, e.name);
          const found = await findExeRecursive(full, depth - 1);
          if (found) return found;
        }
      }
    } catch (err) {
      // ignore permission / missing folders
    }
    return null;
  }

  if (!source) {
    for (const c of candidates) {
      try {
        const found = await findExeRecursive(c, 4);
        if (found) { source = found; break; }
      } catch (e) {
        // ignore
      }
    }
  }

  if (!source) {
    console.error('Installer not found. Tried locations:', tried);
    return { ok: false, error: 'installer_not_found', tried };
  }

  const defaultName = path.basename(source);
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save app installer',
    defaultPath: path.join(os.homedir(), 'Downloads', defaultName),
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(source, filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('Failed to copy installer', err);
    return { ok: false, error: String(err) };
  }
});

const isDev = !app.isPackaged;
const ROOT = path.join(__dirname, '..');

async function startNextServer() {
  // Prefer an already-running dev server when env vars are provided
  const providedUrl = process.env.NEXT_DEV_URL;
  const providedPort = process.env.PORT || process.env.NEXT_DEV_PORT;

  if (providedUrl) {
    await waitForHttp(providedUrl, 20000).catch(() => {});
    return providedUrl;
  }

  if (providedPort) {
    const url = `http://localhost:${providedPort}`;
    await waitForHttp(url, 20000).catch(() => {});
    return url;
  }

  // If a common dev server port is already in use (e.g. 3000) prefer that
  // existing server instead of spawning a new one. This avoids double-start
  // and the race that can happen when running `npx next dev` externally.
  try {
    const common = 3000;
    const commonUrl = `http://localhost:${common}`;
    await waitForHttp(commonUrl, 1000);
    return commonUrl;
  } catch (e) {
    // not responding, continue to spawn
  }

  // Otherwise pick a free port and spawn the appropriate server
  const getPort = await loadGetPort();
  const PORT = await getPort({ port: 3000 });
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: isDev ? 'development' : 'production' };

  try {
    if (isDev) {
      // In dev we run `npx next dev -p <PORT>` so hot reload works.
      // On Windows prefer invoking the npx command shim `npx.cmd` directly
      // to avoid relying on launching cmd.exe via a shell (which can fail
      // in some environments with HRESULT 0x800700E8). On other platforms
      // spawn the `npx` binary.
      const isWindows = process.platform === 'win32';
      try {
        // Prefer the local next binary from node_modules/.bin which avoids
        // relying on shell wrappers like npx or cmd.exe. On Windows the
        // binary is typically `next.cmd`.
        const fsSync = require('fs');
        const localNext = path.join(ROOT, 'node_modules', '.bin', isWindows ? 'next.cmd' : 'next');
        let nextExec = null;
        if (fsSync.existsSync(localNext)) {
          nextExec = localNext;
        } else {
          // Fallback to npx if local binary isn't present
          nextExec = isWindows ? 'npx.cmd' : 'npx';
        }

        // Prefer invoking the Next CLI via node + the resolved CLI script. This
        // avoids shell wrappers and .cmd batch files which can cause spawn
        // failures on some Windows setups.
        let spawned = false;
        try {
          let nextCliPath = null;
          try {
            nextCliPath = require.resolve('next/dist/bin/next', { paths: [ROOT] });
          } catch (e) {
            // ignore
          }

          if (nextCliPath) {
            // Prefer running the CLI with a system `node` to avoid using
            // the Electron executable as the runner.
            const nodeRunner = 'node';
            console.log('Attempting to spawn node runner with Next CLI:', { runner: nodeRunner, script: nextCliPath, cwd: ROOT });
            try {
              serverProc = spawn(nodeRunner, [nextCliPath, 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
              // Pipe child's stdout/stderr to main process so logs appear in terminal
              if (serverProc.stdout) serverProc.stdout.on('data', (c) => process.stdout.write('[next] ' + c.toString()));
              if (serverProc.stderr) serverProc.stderr.on('data', (c) => process.stderr.write('[next][err] ' + c.toString()));
              serverProc.on('error', (err) => {
                console.error('Next (node runner) process error:', err);
              });
              serverProc.on('exit', (code, signal) => {
                console.log('Next (node runner) process exited', { code, signal });
              });
              spawned = true;
            } catch (e) {
              console.error('Failed to spawn node runner for Next CLI, will fallback:', e);
            }
          }
        } catch (e) {
          console.error('Failed to spawn via node+next cli:', e);
        }

        if (!spawned) {
          const args = nextExec.includes('npx') ? ['next', 'dev', '-p', String(PORT)] : ['dev', '-p', String(PORT)];
          console.log('Spawning Next fallback:', { exec: nextExec, args, cwd: ROOT });
          serverProc = spawn(nextExec, args, { cwd: ROOT, env, stdio: 'inherit' });
        }

        serverProc.on('error', (err) => {
          console.error('Next dev process error:', err);
        });
        serverProc.on('exit', (code, signal) => {
          console.log('Next dev process exited', { code, signal });
        });
      } catch (spawnErr) {
        console.error('Failed to spawn Next dev process:', spawnErr);
        throw spawnErr;
      }
    } else {
      const serverEntry = path.join(ROOT, '.next', 'standalone', 'server.js');
      serverProc = spawn(process.execPath, [serverEntry], {
        cwd: ROOT,
        env: { ...env, PORT: String(PORT) },
        stdio: 'ignore',
        detached: false,
      });
    }

    const url = `http://localhost:${env.PORT}`;
    await waitForHttp(url, 20000);
    return url;
  } catch (err) {
    console.error('Failed to start spawned Next server:', err);
    // Best-effort fallback to common dev port
    const fallback = 'http://localhost:3000';
    try {
      await waitForHttp(fallback, 5000);
      return fallback;
    } catch (e) {
      throw err;
    }
  }
}

function createWindow(startUrl) {
  const fsSync = require('fs');
  const possibleIcon = path.join(__dirname, '..', 'electron', 'icon.ico');
  const iconOption = fsSync.existsSync(possibleIcon) ? possibleIcon : undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    ...(iconOption ? { icon: iconOption } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(startUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Remove default application menu to hide File/Edit on Windows
  try { Menu.setApplicationMenu(null); } catch (e) {}

  try {
    const url = await startNextServer();
    createWindow(url);
  } catch (err) {
    console.error('Failed to start Next server:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch (e) {}
  }
});

// ——— utilities ———
async function waitForHttp(url, timeoutMs) {
  const http = require('http');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, () => resolve(true));
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) return reject(new Error('Server start timeout'));
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}
