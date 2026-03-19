/**
 * Configuration resolution for the Obsidian MCP Server.
 *
 * Priority order (highest wins):
 *   1. CLI arg: --vault /path/to/vault
 *   2. Env var: OBSIDIAN_VAULT_PATH
 *   3. .env file: OBSIDIAN_VAULT_PATH=...
 *   4. Default: ~/Documents/Obsidian/MyVault
 */

import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ServerConfig } from './types.js';

const DEFAULT_VAULT_PATH = path.join(
  os.homedir(),
  'Documents',
  'Obsidian',
  'MyVault',
);

/**
 * Parses CLI arguments for --vault <path>.
 */
function getVaultFromCLI(): string | undefined {
  const args = process.argv.slice(2);
  const vaultFlagIndex = args.indexOf('--vault');
  if (vaultFlagIndex !== -1 && args[vaultFlagIndex + 1]) {
    return args[vaultFlagIndex + 1];
  }
  return undefined;
}

/**
 * Resolves and validates the vault path from all config sources.
 * Throws a descriptive error if the path is not a valid directory.
 */
export function resolveConfig(): ServerConfig {
  const rawPath =
    getVaultFromCLI() ??
    process.env['OBSIDIAN_VAULT_PATH'] ??
    DEFAULT_VAULT_PATH;

  const vaultPath = path.resolve(rawPath);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(vaultPath);
  } catch {
    throw new Error(
      `Vault path does not exist: "${vaultPath}"\n` +
        `Set OBSIDIAN_VAULT_PATH in your environment or .env file, ` +
        `or pass --vault <path> on the command line.`,
    );
  }

  if (!stat.isDirectory()) {
    throw new Error(
      `Vault path is not a directory: "${vaultPath}"\n` +
        `Please point OBSIDIAN_VAULT_PATH to an Obsidian vault folder.`,
    );
  }

  return { vaultPath };
}
