/**
 * Shared TypeScript interfaces and types for the Obsidian MCP Server.
 */

// ─── Note Structures ──────────────────────────────────────────────────────────

export interface NoteFrontmatter {
  title?: string;
  tags?: string[];
  date?: string;
  [key: string]: unknown;
}

export interface NoteMetadata {
  path: string;
  title: string;
  tags: string[];
  lastModified: string;
  wordCount: number;
}

export interface NoteContent {
  content: string;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  lastModified: string;
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  body: string;
  wikilinks: WikiLink[];
  mdLinks: MarkdownLink[];
}

export interface WikiLink {
  raw: string;       // [[Note Name]]
  target: string;    // Note Name
  alias?: string;    // display text if [[target|alias]]
}

export interface MarkdownLink {
  raw: string;       // [text](path)
  text: string;
  target: string;
}

// ─── Search Structures ────────────────────────────────────────────────────────

export interface SearchDocument {
  id: string;        // relative path
  title: string;
  content: string;
  tags: string;      // space-separated for MiniSearch
  path: string;
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  excerpt: string;
  tags: string[];
}

// ─── Backlink Structures ──────────────────────────────────────────────────────

export interface Backlink {
  fromPath: string;
  fromTitle: string;
  context: string;
}

// ─── Tool Input/Output Types ──────────────────────────────────────────────────

export interface ReadNoteInput {
  path: string;
}

export interface ReadNoteOutput {
  content: string;
  frontmatter: Record<string, unknown>;
  wordCount: number;
  lastModified: string;
}

export interface WriteNoteInput {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  overwrite?: boolean;
}

export interface WriteNoteOutput {
  success: boolean;
  path: string;
  created: boolean;
}

export interface AppendNoteInput {
  path: string;
  content: string;
  section?: string;
}

export interface AppendNoteOutput {
  success: boolean;
  newWordCount: number;
}

export interface DeleteNoteInput {
  path: string;
  confirm: boolean;
}

export interface DeleteNoteOutput {
  success: boolean;
  deletedPath: string;
}

export interface ListNotesInput {
  folder?: string;
  tag?: string;
  recursive?: boolean;
  limit?: number;
}

export interface ListNotesOutput {
  notes: NoteMetadata[];
}

export interface SearchNotesInput {
  query: string;
  limit?: number;
  searchIn?: Array<'title' | 'content' | 'tags'>;
  tag?: string;
}

export interface SearchNotesOutput {
  results: SearchResult[];
}

export interface GetBacklinksInput {
  path: string;
}

export interface GetBacklinksOutput {
  backlinks: Backlink[];
}

export interface CreateDailyNoteInput {
  date?: string;
  template?: string;
  additionalContent?: string;
}

export interface CreateDailyNoteOutput {
  path: string;
  alreadyExisted: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ServerConfig {
  vaultPath: string;
}
