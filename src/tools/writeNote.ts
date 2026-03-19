/**
 * write_note — Create or overwrite a note in the Obsidian vault.
 *
 * If `overwrite` is false (default) and the file already exists, a
 * NoteConflictError is thrown. Intermediate directories are created
 * automatically. Frontmatter is merged: existing fields not present
 * in the input are preserved.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { WriteNoteOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const writeNoteSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      'Relative path for the note, e.g. "Projects/NewNote.md". ' +
        'Intermediate directories will be created automatically.',
    ),
  content: z
    .string()
    .max(10_000_000, 'Content exceeds 10MB limit.')
    .describe(
      'Markdown body content (do NOT include frontmatter YAML here; ' +
        'use the frontmatter field instead).',
    ),
  frontmatter: z
    .record(z.unknown())
    .optional()
    .describe(
      'Optional frontmatter fields to set. These are merged with any ' +
        'existing frontmatter; incoming fields override existing ones.',
    ),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If false (default), throws an error when the note already exists. ' +
        'Set to true to overwrite an existing note.',
    ),
});

export type WriteNoteInput = z.infer<typeof writeNoteSchema>;

export async function writeNote(
  vault: VaultManager,
  input: WriteNoteInput,
): Promise<WriteNoteOutput> {
  return vault.writeNote(
    input.path,
    input.content,
    input.frontmatter,
    input.overwrite,
  );
}

export function createWriteNoteTool(vault: VaultManager) {
  return {
    name: 'write_note' as const,
    description:
      'Create or overwrite a note in the Obsidian vault. Pass overwrite: true ' +
      'to replace an existing note. Intermediate directories are created ' +
      'automatically. Frontmatter fields are merged with existing ones.',
    inputSchema: writeNoteSchema,
    handler: async (input: WriteNoteInput): Promise<string> => {
      try {
        const result = await writeNote(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
