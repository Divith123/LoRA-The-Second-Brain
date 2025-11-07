const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dist = path.join(ROOT, 'dist');

async function main() {
  try {
    if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
    const filePath = path.join(dist, `LoRA-The-Second-Brain-Dev-Installer.exe`);
    const content = `This is a dummy installer for dev testing.\nGenerated: ${new Date().toISOString()}`;
    // write text to a file with .exe extension for testing; it's not a real installer
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Created dummy installer at', filePath);
  } catch (err) {
    console.error('Failed to create dummy installer', err);
    process.exitCode = 1;
  }
}

main();
