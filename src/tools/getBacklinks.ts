/**
 * get_backlinks — Find all notes that link to a given note.
 *
 * Scans the entire vault for:
 *   - [[WikiLinks]] whose target resolves to the requested note
 *   - [text](path.md) markdown links that resolve to the requested note
 *
 * Each backlink includes the source note path, its title, and up to 150 chars
 * of context around the link.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { GetBacklinksOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const getBacklinksSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Relative path of the note to find backlinks for, e.g. "Projects/MyNote.md"',
    ),
});

export type GetBacklinksInput = z.infer<typeof getBacklinksSchema>;

export async function getBacklinks(
  vault: VaultManager,
  input: GetBacklinksInput,
): Promise<GetBacklinksOutput> {
  const backlinks = await vault.getBacklinks(input.path);
  return { backlinks };
}

export function createGetBacklinksTool(vault: VaultManager) {
  return {
    name: 'get_backlinks' as const,
    description:
      'Find all notes in the vault that link to a given note via ' +
      '[[WikiLinks]] or standard markdown links. Returns the source path, ' +
      'title, and surrounding context (up to 150 chars) for each backlink.',
    inputSchema: getBacklinksSchema,
    handler: async (input: GetBacklinksInput): Promise<string> => {
      try {
        const result = await getBacklinks(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
