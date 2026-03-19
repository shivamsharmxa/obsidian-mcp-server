/**
 * search_notes — Full-text search across the Obsidian vault using MiniSearch.
 *
 * Supports fuzzy matching, field weighting (title > tags > content),
 * optional tag pre-filtering, and configurable field selection.
 * The search index is built lazily and automatically invalidated when
 * vault files change.
 *
 * Each result includes a 200-char excerpt with the matched term highlighted
 * in **bold** markdown for easy context scanning.
 */

import { z } from 'zod';
import type { VaultManager } from '../vault/VaultManager.js';
import type { SearchNotesOutput } from '../types.js';
import { toErrorMessage } from '../errors.js';

export const searchNotesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Full-text search query. Supports fuzzy matching.'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(20)
    .describe('Maximum number of results to return. Defaults to 20.'),
  searchIn: z
    .array(z.enum(['title', 'content', 'tags']))
    .optional()
    .describe(
      'Fields to search in. Defaults to all fields (title, content, tags). ' +
        'Title and tags are boosted higher than content.',
    ),
  tag: z
    .string()
    .optional()
    .describe(
      'Optional tag to pre-filter notes before running full-text search. ' +
        'Only notes with this tag will be searched.',
    ),
});

export type SearchNotesInput = z.infer<typeof searchNotesSchema>;

export async function searchNotes(
  vault: VaultManager,
  input: SearchNotesInput,
): Promise<SearchNotesOutput> {
  const opts: { limit?: number; searchIn?: Array<'title' | 'content' | 'tags'>; tag?: string } = {};
  if (input.limit !== undefined) opts.limit = input.limit;
  if (input.searchIn !== undefined) opts.searchIn = input.searchIn;
  if (input.tag !== undefined) opts.tag = input.tag;
  const results = await vault.searchIndex.search(input.query, opts);
  return { results };
}

export function createSearchNotesTool(vault: VaultManager) {
  return {
    name: 'search_notes' as const,
    description:
      'Full-text fuzzy search across all notes in the vault using MiniSearch. ' +
      'Returns results with relevance scores and 200-char excerpts with the ' +
      'match term highlighted in **bold**. Title and tag matches rank higher than body matches.',
    inputSchema: searchNotesSchema,
    handler: async (input: SearchNotesInput): Promise<string> => {
      try {
        const result = await searchNotes(vault, input);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
    },
  };
}
