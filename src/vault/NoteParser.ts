/**
 * NoteParser — parses markdown notes for frontmatter, wikilinks, and
 * standard markdown links. Built on gray-matter.
 */

import matter from 'gray-matter';
import type {
  NoteFrontmatter,
  ParsedNote,
  WikiLink,
  MarkdownLink,
} from '../types.js';

// Matches [[target]] or [[target|alias]]
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

// Matches [text](./path) or [text](path.md) — relative md links only
const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+\.md[^)]*)\)/g;

export class NoteParser {
  /**
   * Parse a raw markdown string into frontmatter + body + extracted links.
   */
  static parse(raw: string): ParsedNote {
    const { data, content } = matter(raw);

    const frontmatter = data as NoteFrontmatter;
    const body = content;

    const wikilinks = NoteParser.extractWikilinks(body);
    const mdLinks = NoteParser.extractMarkdownLinks(body);

    return { frontmatter, body, wikilinks, mdLinks };
  }

  /**
   * Serialize frontmatter + body back into a markdown string.
   */
  static stringify(
    body: string,
    frontmatter: Record<string, unknown>,
  ): string {
    if (Object.keys(frontmatter).length === 0) {
      return body;
    }
    return matter.stringify(body, frontmatter);
  }

  /**
   * Merge two frontmatter objects. Fields in `incoming` override `existing`
   * only if they are explicitly present; existing fields not in `incoming`
   * are preserved.
   */
  static mergeFrontmatter(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    return { ...existing, ...incoming };
  }

  /**
   * Extract the title from frontmatter.title, or derive it from the first H1
   * heading in the body, or fall back to an empty string.
   */
  static extractTitle(parsed: ParsedNote, fallback: string = ''): string {
    if (typeof parsed.frontmatter.title === 'string') {
      return parsed.frontmatter.title;
    }
    const h1Match = /^#\s+(.+)$/m.exec(parsed.body);
    if (h1Match?.[1]) {
      return h1Match[1].trim();
    }
    return fallback;
  }

  /**
   * Extract tags from frontmatter (handles both array and space-separated string).
   */
  static extractTags(parsed: ParsedNote): string[] {
    // Access via index to preserve the raw unknown value from gray-matter
    const tags: unknown = (parsed.frontmatter as Record<string, unknown>)['tags'];
    if (Array.isArray(tags)) {
      return tags.map(String);
    }
    if (typeof tags === 'string' && tags.trim().length > 0) {
      return tags.split(/[\s,]+/).filter(Boolean);
    }
    return [];
  }

  /**
   * Count words in a string (splits on whitespace).
   */
  static countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Extract all [[wikilinks]] from text.
   */
  static extractWikilinks(text: string): WikiLink[] {
    const links: WikiLink[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(WIKILINK_RE.source, WIKILINK_RE.flags);
    while ((match = re.exec(text)) !== null) {
      const raw = match[0] ?? '';
      const target = (match[1] ?? '').trim();
      const aliasRaw = match[2];
      const link: WikiLink = { raw, target };
      if (aliasRaw !== undefined) {
        link.alias = aliasRaw.trim();
      }
      links.push(link);
    }
    return links;
  }

  /**
   * Extract all [text](path.md) markdown links from text.
   */
  static extractMarkdownLinks(text: string): MarkdownLink[] {
    const links: MarkdownLink[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(MD_LINK_RE.source, MD_LINK_RE.flags);
    while ((match = re.exec(text)) !== null) {
      const raw = match[0] ?? '';
      const linkText = match[1] ?? '';
      const target = match[2] ?? '';
      links.push({ raw, text: linkText, target });
    }
    return links;
  }

  /**
   * Given a block of text and a match position, return up to `maxLen` chars
   * surrounding that position as an excerpt. The match term is wrapped in
   * **bold** markdown.
   */
  static buildExcerpt(
    text: string,
    matchTerm: string,
    maxLen: number = 200,
  ): string {
    const lower = text.toLowerCase();
    const termLower = matchTerm.toLowerCase();
    const idx = lower.indexOf(termLower);

    if (idx === -1) {
      // Fallback: return first maxLen chars
      return text.slice(0, maxLen).replace(/\s+$/, '') + '…';
    }

    const half = Math.floor(maxLen / 2);
    const start = Math.max(0, idx - half);
    const end = Math.min(text.length, idx + termLower.length + half);

    let excerpt = text.slice(start, end);

    // Highlight the match
    const matchInExcerpt = text.slice(idx, idx + matchTerm.length);
    excerpt = excerpt.replace(matchInExcerpt, `**${matchInExcerpt}**`);

    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';

    return prefix + excerpt.trim() + suffix;
  }
}
