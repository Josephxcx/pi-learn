const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const settingsPath = path.join(os.homedir(), '.pi', 'agent', 'settings.json');
let settings = {};

try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
  console.log("Could not read Pi settings. Skipping dependency check.");
  process.exit(0);
}

const requiredDeps = ['@juicesharp/rpiv-ask-user-question'];
const packages = settings.packages || [];

function isInstalled(dep) {
  return packages.some(p => {
    if (typeof p === 'string') return p.includes(dep);
    if (p && p.source) return p.source.includes(dep);
    return false;
  });
}

for (const dep of requiredDeps) {
  if (!isInstalled(dep)) {
    console.log(`Dependency ${dep} is missing in Pi environment. Installing it globally via Pi...`);
    try {
      execSync(`pi install npm:${dep}`, { stdio: 'inherit' });
      console.log(`Successfully installed ${dep}.`);
    } catch (err) {
      console.error(`Failed to install ${dep}. Please install it manually: pi install npm:${dep}`);
    }
  } else {
    console.log(`Dependency ${dep} already installed in Pi environment. Reusing existing installation.`);
  }
}
