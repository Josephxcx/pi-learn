import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface LearningConfig { vaultPath: string; stateDir: string }
export interface ConfigOptions { env?: NodeJS.ProcessEnv; homeDir?: string; platform?: NodeJS.Platform }

function configuredPath(value: string, name: string, home: string): string {
  const expanded = value === '~' ? home : value.startsWith('~/') || value.startsWith('~\\') ? path.join(home, value.slice(2)) : value;
  if (!path.isAbsolute(expanded)) throw new Error(`${name} must be an absolute path (or start with ~/).`);
  return path.resolve(expanded);
}

/** Explicit configuration wins. Multiple discovered vaults require an explicit selection. */
export function resolveLearningConfig(options: ConfigOptions = {}): LearningConfig {
  const env = options.env ?? process.env;
  const home = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const stateDir = configuredPath(env.PI_LEARN_STATE_DIR ?? path.join(home, '.pi', 'agent', 'pi-learn'), 'PI_LEARN_STATE_DIR', home);
  if (env.PI_LEARN_VAULT) return { vaultPath: configuredPath(env.PI_LEARN_VAULT, 'PI_LEARN_VAULT', home), stateDir };
  const configPath = platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
    : platform === 'win32'
      ? path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')
      : path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'obsidian', 'obsidian.json');
  let raw: string;
  try { raw = fs.readFileSync(configPath, 'utf8'); } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    return { vaultPath: path.join(home, 'Documents', 'pi-learn'), stateDir };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`Invalid Obsidian configuration: ${configPath}. Set PI_LEARN_VAULT explicitly.`); }
  if (!parsed || typeof parsed !== 'object' || !('vaults' in parsed) || !parsed.vaults || typeof parsed.vaults !== 'object' || Array.isArray(parsed.vaults)) throw new Error(`Invalid Obsidian vault configuration: ${configPath}. Set PI_LEARN_VAULT explicitly.`);
  const vaults = [...new Set(Object.values(parsed.vaults).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('path' in entry) || typeof entry.path !== 'string' || !path.isAbsolute(entry.path)) return [];
    try { return fs.statSync(entry.path).isDirectory() ? [path.resolve(entry.path)] : []; } catch { return []; }
  }))];
  if (vaults.length > 1) throw new Error('Multiple Obsidian vaults found. Set PI_LEARN_VAULT to choose one explicitly.');
  return { vaultPath: vaults[0] ?? path.join(home, 'Documents', 'pi-learn'), stateDir };
}
