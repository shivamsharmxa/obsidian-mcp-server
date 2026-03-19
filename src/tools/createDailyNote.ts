/**
 * create_daily_note — Create (or retrieve) an Obsidian-style daily note.
 *
 * Daily notes are stored as `Daily Notes/YYYY-MM-DD.md`. If the note
 * already exists, returns immediately with `alreadyExisted: true`.
 *
 * Template support: if `template` is provided (relative vault path), its
 * content is used as the note body with token substitution:
 *   {{date}}  → YYYY-MM-DD
 *   {{time}}  → HH:MM (local time)
 *   {{title}} → YYYY-MM-DD
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { CreateDailyNoteOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const createDailyNoteSchema = z.object({
  date: z
    .string()
    .optional()
    .describe(
      'ISO 8601 date string, e.g. "2024-03-15". Defaults to today if omitted.',
    ),
  template: z
    .string()
    .optional()
    .describe(
      'Optional relative vault path to a template note, e.g. "Templates/Daily.md". ' +
        'Supports {{date}}, {{time}}, and {{title}} token substitution.',
    ),
  additionalContent: z
    .string()
    .optional()
    .describe('Optional markdown content to append after the template/default content.'),
});

export type CreateDailyNoteInput = z.infer<typeof createDailyNoteSchema>;

export async function createDailyNote(
  vault: VaultManager,
  input: CreateDailyNoteInput,
): Promise<CreateDailyNoteOutput> {
  const opts: { date?: string; template?: string; additionalContent?: string } = {};
  if (input.date !== undefined) opts.date = input.date;
  if (input.template !== undefined) opts.template = input.template;
  if (input.additionalContent !== undefined) opts.additionalContent = input.additionalContent;
  return vault.createDailyNote(opts);
}

export function createDailyNoteTool(vault: VaultManager) {
  return {
    name: 'create_daily_note' as const,
    description:
      'Create an Obsidian-style daily note at "Daily Notes/YYYY-MM-DD.md". ' +
      'If the note already exists, returns it without modification. ' +
      'Optionally populate from a template with {{date}}, {{time}}, {{title}} tokens.',
    inputSchema: createDailyNoteSchema,
    handler: async (input: CreateDailyNoteInput): Promise<string> => {
      try {
        const result = await createDailyNote(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
