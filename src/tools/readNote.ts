/**
 * read_note — Read a note from the Obsidian vault.
 *
 * Returns the raw markdown body, parsed frontmatter, word count, and
 * last-modified timestamp. The body does NOT include the YAML frontmatter
 * block — that is provided separately in the `frontmatter` field.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { ReadNoteOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const readNoteSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Relative path to the note within the vault, e.g. "Projects/MyNote.md"',
    ),
});

export type ReadNoteInput = z.infer<typeof readNoteSchema>;

export async function readNote(
  vault: VaultManager,
  input: ReadNoteInput,
): Promise<ReadNoteOutput> {
  return vault.readNote(input.path);
}

export function createReadNoteTool(vault: VaultManager) {
  return {
    name: 'read_note' as const,
    description:
      'Read a note from the Obsidian vault. Returns the markdown body ' +
      '(frontmatter stripped), the parsed frontmatter object, word count, ' +
      'and the ISO 8601 last-modified timestamp.',
    inputSchema: readNoteSchema,
    handler: async (input: ReadNoteInput): Promise<string> => {
      try {
        const result = await readNote(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
