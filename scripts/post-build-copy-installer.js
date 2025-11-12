const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function isIgnored(p) {
  return p.includes('node_modules') || p.includes('.git') || p.includes('.next') || p.includes('dist') || p.includes('out');
}

function walkDir(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (isIgnored(full)) continue;
      if (e.isDirectory()) {
        walkDir(full, results);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
        const stat = fs.statSync(full);
        results.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  } catch (err) {
    // ignore unreadable directories
  }
  return results;
}

function main() {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  // Find candidate exe files (excluding dist) modified within last 24h
  const all = walkDir(ROOT, []);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = all.filter(a => a.mtimeMs >= oneDayAgo);

  // Prefer the most recently modified
  recent.sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size);

  let chosen = null;
  if (recent.length > 0) chosen = recent[0];

  // If nothing recent outside dist, look inside dist (maybe electron-builder already put it there)
  if (!chosen) {
    try {
      const inside = fs.readdirSync(DIST).filter(f => f.toLowerCase().endsWith('.exe'))
        .map(f => ({ path: path.join(DIST, f), mtimeMs: fs.statSync(path.join(DIST, f)).mtimeMs, size: fs.statSync(path.join(DIST, f)).size }));
      inside.sort((a,b)=>b.mtimeMs-a.mtimeMs);
      if (inside.length>0) chosen = inside[0];
    } catch (e) {
      // ignore
    }
  }

  if (!chosen) {
    console.log('No installer artifact found to copy into dist/. Exiting.');
    return;
  }

  const basename = path.basename(chosen.path);
  const dest = path.join(DIST, basename);

  // If chosen is already in dist, nothing to do
  if (path.resolve(chosen.path) === path.resolve(dest)) {
    console.log('Installer already present in dist/:', dest);
    return;
  }

  try {
    fs.copyFileSync(chosen.path, dest);
    console.log('Copied installer to', dest);
  } catch (err) {
    console.error('Failed to copy installer:', err);
    process.exitCode = 2;
  }
}

main();
