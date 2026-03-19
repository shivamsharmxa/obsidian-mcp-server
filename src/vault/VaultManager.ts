/**
 * VaultManager — core class for all vault file I/O operations.
 *
 * Responsibilities:
 *   - Path safety (traversal protection)
 *   - Atomic writes (write-to-temp-then-rename)
 *   - CRUD operations on markdown notes
 *   - Trash management
 *   - Backlink scanning
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { NoteParser } from './NoteParser.js';
import { SearchIndex } from './SearchIndex.js';
import {
  NoteNotFoundError,
  NoteConflictError,
  VaultSecurityError,
  InvalidConfirmationError,
} from '../errors.js';
import type {
  NoteContent,
  NoteMetadata,
  Backlink,
  WriteNoteOutput,
  AppendNoteOutput,
  DeleteNoteOutput,
  CreateDailyNoteOutput,
} from '../types.js';

export class VaultManager {
  public readonly vaultRoot: string;
  public readonly searchIndex: SearchIndex;

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.searchIndex = new SearchIndex(this.vaultRoot);
  }

  // ─── Path Safety ──────────────────────────────────────────────────────────

  /**
   * Resolve a relative or absolute path strictly inside the vault.
   * Throws VaultSecurityError if the resolved path escapes the vault root.
   */
  resolvePath(notePath: string): string {
    const abs = path.resolve(this.vaultRoot, notePath);
    if (!abs.startsWith(this.vaultRoot + path.sep) && abs !== this.vaultRoot) {
      throw new VaultSecurityError(notePath);
    }
    return abs;
  }

  /**
   * Check whether an absolute path is inside the vault root.
   */
  isInsideVault(absPath: string): boolean {
    const normalized = path.resolve(absPath);
    return (
      normalized.startsWith(this.vaultRoot + path.sep) ||
      normalized === this.vaultRoot
    );
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  /**
   * Read a note and return its content, frontmatter, word count, and mtime.
   */
  async readNote(notePath: string): Promise<NoteContent> {
    const absPath = this.resolvePath(notePath);
    await this.assertExists(absPath, notePath);

    const raw = await fs.readFile(absPath, 'utf8');
    const stat = await fs.stat(absPath);
    const parsed = NoteParser.parse(raw);

    return {
      content: parsed.body,
      frontmatter: parsed.frontmatter as Record<string, unknown>,
      wordCount: NoteParser.countWords(parsed.body),
      lastModified: stat.mtime.toISOString(),
    };
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  /**
   * Write a note. Optionally merge frontmatter. Atomic write via temp file.
   */
  async writeNote(
    notePath: string,
    content: string,
    frontmatter?: Record<string, unknown>,
    overwrite: boolean = false,
  ): Promise<WriteNoteOutput> {
    const absPath = this.resolvePath(notePath);
    const exists = existsSync(absPath);

    if (exists && !overwrite) {
      throw new NoteConflictError(notePath);
    }

    // Auto-create parent directories
    await fs.mkdir(path.dirname(absPath), { recursive: true });

    let finalContent: string;

    if (frontmatter && Object.keys(frontmatter).length > 0) {
      // If file exists, merge with existing frontmatter
      let existingFrontmatter: Record<string, unknown> = {};
      if (exists) {
        try {
          const existingRaw = await fs.readFile(absPath, 'utf8');
          const existingParsed = NoteParser.parse(existingRaw);
          existingFrontmatter = existingParsed.frontmatter as Record<
            string,
            unknown
          >;
        } catch {
          // Ignore read errors on existing file
        }
      }
      const merged = NoteParser.mergeFrontmatter(existingFrontmatter, frontmatter);
      finalContent = NoteParser.stringify(content, merged);
    } else {
      finalContent = content;
    }

    await this.atomicWrite(absPath, finalContent);
    this.searchIndex.invalidate();

    return { success: true, path: notePath, created: !exists };
  }

  // ─── Append ────────────────────────────────────────────────────────────────

  /**
   * Append content to a note, optionally under a specific heading section.
   */
  async appendNote(
    notePath: string,
    content: string,
    section?: string,
  ): Promise<AppendNoteOutput> {
    const absPath = this.resolvePath(notePath);
    await this.assertExists(absPath, notePath);

    const raw = await fs.readFile(absPath, 'utf8');
    let updated: string;

    if (section) {
      updated = this.appendUnderSection(raw, section, content);
    } else {
      // Ensure a trailing newline before appending
      const separator = raw.endsWith('\n') ? '\n' : '\n\n';
      updated = raw + separator + content;
    }

    await this.atomicWrite(absPath, updated);
    this.searchIndex.invalidate();

    const wordCount = NoteParser.countWords(updated);
    return { success: true, newWordCount: wordCount };
  }

  /**
   * Insert `content` directly below a heading matching `section`, before the
   * next heading of the same or higher level.
   */
  private appendUnderSection(
    raw: string,
    section: string,
    content: string,
  ): string {
    const lines = raw.split('\n');

    // Find the heading line
    let sectionLineIdx = -1;
    let sectionLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (match) {
        const headingText = (match[2] ?? '').trim();
        if (headingText.toLowerCase() === section.toLowerCase()) {
          sectionLineIdx = i;
          sectionLevel = (match[1] ?? '').length;
          break;
        }
      }
    }

    if (sectionLineIdx === -1) {
      // Section not found — append at end
      const separator = raw.endsWith('\n') ? '\n' : '\n\n';
      return raw + separator + content;
    }

    // Find the next heading of same or higher level
    let insertIdx = lines.length;
    for (let i = sectionLineIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const match = /^(#{1,6})\s/.exec(line);
      if (match && (match[1] ?? '').length <= sectionLevel) {
        insertIdx = i;
        break;
      }
    }

    // Insert content before that next heading (with blank line separation)
    const before = lines.slice(0, insertIdx);
    const after = lines.slice(insertIdx);

    // Ensure blank line at end of section before inserting
    if (before[before.length - 1]?.trim() !== '') {
      before.push('');
    }
    before.push(content);
    if (after.length > 0 && after[0]?.trim() !== '') {
      before.push('');
    }

    return [...before, ...after].join('\n');
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /**
   * Move a note to the vault's .trash/ subfolder instead of permanent delete.
   * `confirm` must be true.
   */
  async deleteNote(
    notePath: string,
    confirm: boolean,
  ): Promise<DeleteNoteOutput> {
    if (!confirm) {
      throw new InvalidConfirmationError('delete_note');
    }

    const absPath = this.resolvePath(notePath);
    await this.assertExists(absPath, notePath);

    const trashDir = path.join(this.vaultRoot, '.trash');
    await fs.mkdir(trashDir, { recursive: true });

    // Flatten the note path into a filename to avoid subdirectory conflicts
    const flatName =
      notePath.replace(/[\\/]/g, '__') +
      '.' +
      Date.now().toString(36) +
      '.md';
    const trashPath = path.join(trashDir, flatName);

    await fs.rename(absPath, trashPath);
    this.searchIndex.invalidate();

    return { success: true, deletedPath: notePath };
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  /**
   * List notes in the vault with optional folder, tag, and recursive filters.
   */
  async listNotes(options: {
    folder?: string;
    tag?: string;
    recursive?: boolean;
    limit?: number;
  }): Promise<NoteMetadata[]> {
    const { folder, tag, recursive = true, limit = 100 } = options;

    const searchRoot = folder
      ? this.resolvePath(folder)
      : this.vaultRoot;

    const files = await this.collectMarkdownFiles(searchRoot, recursive);

    const metaList: NoteMetadata[] = [];

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const stat = await fs.stat(filePath);
        const parsed = NoteParser.parse(raw);
        const tags = NoteParser.extractTags(parsed);
        const relativePath = path.relative(this.vaultRoot, filePath);

        if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
          continue;
        }

        metaList.push({
          path: relativePath,
          title: NoteParser.extractTitle(parsed, path.basename(filePath, '.md')),
          tags,
          lastModified: stat.mtime.toISOString(),
          wordCount: NoteParser.countWords(parsed.body),
        });
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by lastModified descending
    metaList.sort(
      (a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
    );

    return metaList.slice(0, limit);
  }

  // ─── Backlinks ─────────────────────────────────────────────────────────────

  /**
   * Find all notes that link to the given note via [[wikilinks]] or md links.
   */
  async getBacklinks(notePath: string): Promise<Backlink[]> {
    const absTarget = this.resolvePath(notePath);
    await this.assertExists(absTarget, notePath);

    const targetBase = path.basename(notePath, '.md');
    const targetRelative = path.relative(this.vaultRoot, absTarget);

    const allFiles = await this.collectMarkdownFiles(this.vaultRoot, true);
    const backlinks: Backlink[] = [];

    await Promise.all(
      allFiles.map(async (filePath) => {
        if (path.resolve(filePath) === path.resolve(absTarget)) return;

        try {
          const raw = await fs.readFile(filePath, 'utf8');
          const parsed = NoteParser.parse(raw);
          const fromRelative = path.relative(this.vaultRoot, filePath);
          const fromTitle = NoteParser.extractTitle(
            parsed,
            path.basename(filePath, '.md'),
          );

          // Check wikilinks
          for (const wl of parsed.wikilinks) {
            if (wl.target.toLowerCase() === targetBase.toLowerCase()) {
              const context = this.extractLinkContext(raw, wl.raw);
              backlinks.push({
                fromPath: fromRelative,
                fromTitle,
                context,
              });
              return; // One backlink per file is sufficient
            }
          }

          // Check markdown links
          for (const ml of parsed.mdLinks) {
            const resolvedTarget = path.resolve(
              path.dirname(filePath),
              ml.target,
            );
            const resolvedRelative = path.relative(
              this.vaultRoot,
              resolvedTarget,
            );

            if (
              resolvedRelative === targetRelative ||
              resolvedRelative === targetRelative.replace(/\.md$/, '')
            ) {
              const context = this.extractLinkContext(raw, ml.raw);
              backlinks.push({
                fromPath: fromRelative,
                fromTitle,
                context,
              });
              return;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }),
    );

    return backlinks;
  }

  /**
   * Extract up to 150 chars of context around the first occurrence of `linkStr`.
   */
  private extractLinkContext(text: string, linkStr: string): string {
    const idx = text.indexOf(linkStr);
    if (idx === -1) return linkStr;

    // Find sentence boundaries
    const start = Math.max(0, idx - 75);
    const end = Math.min(text.length, idx + linkStr.length + 75);
    let context = text.slice(start, end).replace(/\n+/g, ' ').trim();

    if (start > 0) context = '…' + context;
    if (end < text.length) context = context + '…';

    return context;
  }

  // ─── Daily Notes ───────────────────────────────────────────────────────────

  /**
   * Create (or return existing) a daily note following Obsidian's convention.
   */
  async createDailyNote(options: {
    date?: string;
    template?: string;
    additionalContent?: string;
  }): Promise<CreateDailyNoteOutput> {
    const { date, template, additionalContent } = options;

    const noteDate = date ? new Date(date) : new Date();
    if (isNaN(noteDate.getTime())) {
      throw new Error(`Invalid date: "${date}"`);
    }

    const dateStr = noteDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const notePath = path.join('Daily Notes', `${dateStr}.md`);
    const absPath = this.resolvePath(notePath);

    const alreadyExisted = existsSync(absPath);

    if (alreadyExisted) {
      return { path: notePath, alreadyExisted: true };
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true });

    let content: string;

    if (template) {
      const templateAbs = this.resolvePath(template);
      await this.assertExists(templateAbs, template);
      const templateRaw = await fs.readFile(templateAbs, 'utf8');
      content = this.applyDailyNoteTemplate(templateRaw, noteDate, dateStr);
    } else {
      content = this.defaultDailyNoteContent(noteDate, dateStr);
    }

    if (additionalContent) {
      content = content.trimEnd() + '\n\n' + additionalContent;
    }

    await this.atomicWrite(absPath, content);
    this.searchIndex.invalidate();

    return { path: notePath, alreadyExisted: false };
  }

  private applyDailyNoteTemplate(
    template: string,
    date: Date,
    dateStr: string,
  ): string {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return template
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{title\}\}/g, dateStr);
  }

  private defaultDailyNoteContent(date: Date, dateStr: string): string {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return [
      `---`,
      `date: ${dateStr}`,
      `tags: [daily]`,
      `---`,
      ``,
      `# ${dateStr} — ${dayName}`,
      ``,
      `## Tasks`,
      ``,
      `- [ ] `,
      ``,
      `## Notes`,
      ``,
      ``,
    ].join('\n');
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Collect all .md files under a directory, with optional recursion.
   * Skips hidden directories (starting with '.').
   */
  async collectMarkdownFiles(
    dir: string,
    recursive: boolean,
  ): Promise<string[]> {
    const results: string[] = [];
    await this.walkForFiles(dir, recursive, results);
    return results;
  }

  private async walkForFiles(
    dir: string,
    recursive: boolean,
    results: string[],
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const tasks: Promise<void>[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        tasks.push(this.walkForFiles(fullPath, recursive, results));
      }
    }

    await Promise.all(tasks);
  }

  /**
   * Atomic write: write to a temp file then rename atomically.
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
    try {
      await fs.writeFile(tmpPath, content, 'utf8');
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Assert a file exists, throwing NoteNotFoundError if not.
   */
  private async assertExists(absPath: string, displayPath: string): Promise<void> {
    try {
      await fs.access(absPath);
    } catch {
      throw new NoteNotFoundError(displayPath);
    }
  }
}
