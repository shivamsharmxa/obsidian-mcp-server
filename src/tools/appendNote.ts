/**
 * append_note — Append content to an existing note in the Obsidian vault.
 *
 * If a `section` heading is provided, the content is inserted directly
 * below that heading (before the next heading of the same or higher level).
 * If the section is not found, the content is appended at the end of the file.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { AppendNoteOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const appendNoteSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Relative path to the note, e.g. "Projects/MyNote.md"'),
  content: z
    .string()
    .min(1)
    .max(10_000_000, 'Content exceeds 10MB limit.')
    .describe('Markdown content to append.'),
  section: z
    .string()
    .optional()
    .describe(
      'Optional H2 or H3 heading text to append under. ' +
        'The content is inserted before the next heading of the same or higher level. ' +
        'If the section is not found, content is appended at the end.',
    ),
});

export type AppendNoteInput = z.infer<typeof appendNoteSchema>;

export async function appendNote(
  vault: VaultManager,
  input: AppendNoteInput,
): Promise<AppendNoteOutput> {
  return vault.appendNote(input.path, input.content, input.section);
}

export function createAppendNoteTool(vault: VaultManager) {
  return {
    name: 'append_note' as const,
    description:
      'Append markdown content to an existing note. Optionally target a ' +
      'specific section heading — content is inserted below that heading. ' +
      'Returns the updated word count.',
    inputSchema: appendNoteSchema,
    handler: async (input: AppendNoteInput): Promise<string> => {
      try {
        const result = await appendNote(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
