/**
 * delete_note — Move a note to the vault's .trash/ folder.
 *
 * IMPORTANT: The `confirm` parameter must be set to `true` or the operation
 * is rejected. Notes are NOT permanently deleted — they are moved to a
 * `.trash/` subfolder inside the vault root with a timestamp suffix.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { DeleteNoteOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const deleteNoteSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Relative path to the note to delete, e.g. "Projects/OldNote.md"'),
  confirm: z
    .boolean()
    .describe(
      'Must be set to true to confirm the deletion. ' +
        'If false, the operation is rejected with an error. ' +
        'Notes are moved to .trash/ inside the vault, not permanently deleted.',
    ),
});

export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>;

export async function deleteNote(
  vault: VaultManager,
  input: DeleteNoteInput,
): Promise<DeleteNoteOutput> {
  return vault.deleteNote(input.path, input.confirm);
}

export function createDeleteNoteTool(vault: VaultManager) {
  return {
    name: 'delete_note' as const,
    description:
      'Move a note to the vault .trash/ folder (not permanent deletion). ' +
      'You MUST pass confirm: true. The note is recoverable from .trash/ manually.',
    inputSchema: deleteNoteSchema,
    handler: async (input: DeleteNoteInput): Promise<string> => {
      try {
        const result = await deleteNote(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
