// Diagnostics only: installing pi-learn never changes global Pi settings or packages.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const name of ['@earendil-works/pi-coding-agent']) {
  try {
    require.resolve(name);
    console.log(`${name}: available locally`);
  } catch {
    console.log(`${name}: not resolved locally; Pi may provide it at runtime.`);
  }
}
console.log('Interactive MCQs are optional. Without a question tool, pi-learn uses ordinary chat.');
