/**
 * list_notes — List notes in the Obsidian vault with optional filters.
 *
 * Supports filtering by folder, frontmatter tag, and recursive traversal.
 * Results are sorted by last-modified descending and capped by `limit`.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { ListNotesOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const listNotesSchema = z.object({
  folder: z
    .string()
    .optional()
    .describe(
      'Optional relative folder path to restrict listing, e.g. "Projects". ' +
        'Omit to list the entire vault.',
    ),
  tag: z
    .string()
    .optional()
    .describe(
      'Optional tag to filter by (matches frontmatter `tags` array). ' +
        'Case-insensitive.',
    ),
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to recurse into subdirectories. Defaults to true.'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(100)
    .describe('Maximum number of notes to return. Defaults to 100.'),
});

export type ListNotesInput = z.infer<typeof listNotesSchema>;

export async function listNotes(
  vault: VaultManager,
  input: ListNotesInput,
): Promise<ListNotesOutput> {
  const opts: { folder?: string; tag?: string; recursive?: boolean; limit?: number } = {};
  if (input.folder !== undefined) opts.folder = input.folder;
  if (input.tag !== undefined) opts.tag = input.tag;
  if (input.recursive !== undefined) opts.recursive = input.recursive;
  if (input.limit !== undefined) opts.limit = input.limit;
  const notes = await vault.listNotes(opts);
  return { notes };
}

export function createListNotesTool(vault: VaultManager) {
  return {
    name: 'list_notes' as const,
    description:
      'List notes in the vault. Filter by folder and/or tag. ' +
      'Results include path, title, tags, lastModified, and wordCount, ' +
      'sorted by last-modified descending.',
    inputSchema: listNotesSchema,
    handler: async (input: ListNotesInput): Promise<string> => {
      try {
        const result = await listNotes(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
