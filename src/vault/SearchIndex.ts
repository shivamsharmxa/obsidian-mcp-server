/**
 * SearchIndex — MiniSearch wrapper with automatic index invalidation.
 *
 * The index is built lazily on first search call and automatically
 * rebuilt if the vault directory mtime has changed since the last build.
 */

import MiniSearch from 'minisearch';
import fs from 'fs/promises';
import path from 'path';
import { NoteParser } from './NoteParser.js';
import { SearchIndexError } from '../errors.js';
import type { SearchDocument, SearchResult } from '../types.js';

interface IndexState {
  index: MiniSearch<SearchDocument>;
  builtAt: number;      // Date.now() when index was built
  vaultMtime: number;   // mtime of vault root dir at build time
}

export class SearchIndex {
  private readonly vaultRoot: string;
  private state: IndexState | null = null;

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  /**
   * Search the vault. Builds or rebuilds the index as needed.
   *
   * @param query    Full-text query string.
   * @param options  Search options (limit, fields, tag filter).
   */
  async search(
    query: string,
    options: {
      limit?: number;
      searchIn?: Array<'title' | 'content' | 'tags'>;
      tag?: string;
    } = {},
  ): Promise<SearchResult[]> {
    const { limit = 20, searchIn, tag } = options;

    const index = await this.getIndex();

    const fields = searchIn ?? ['title', 'content', 'tags'];

    let rawResults = index.search(query, {
      fields,
      boost: { title: 3, tags: 2, content: 1 },
      fuzzy: 0.2,
      prefix: true,
    });

    // Pre-filter by tag if requested
    if (tag) {
      rawResults = rawResults.filter((r) => {
        const doc = index.getStoredFields(r.id) as SearchDocument | undefined;
        if (!doc) return false;
        const tags = doc.tags.split(' ').filter(Boolean);
        return tags.some((t) => t.toLowerCase() === tag.toLowerCase());
      });
    }

    rawResults = rawResults.slice(0, limit);

    return rawResults.map((r) => {
      const doc = index.getStoredFields(r.id) as SearchDocument | undefined;
      const title = doc?.title ?? path.basename(r.id, '.md');
      const content = doc?.content ?? '';
      const tags = doc?.tags.split(' ').filter(Boolean) ?? [];
      const excerpt = NoteParser.buildExcerpt(content, query, 200);

      return {
        path: r.id,
        title,
        score: r.score,
        excerpt,
        tags,
      };
    });
  }

  /**
   * Force a full index rebuild regardless of mtime.
   */
  async rebuild(): Promise<void> {
    this.state = await this.buildIndex();
  }

  /**
   * Invalidate the current index so the next search triggers a rebuild.
   */
  invalidate(): void {
    this.state = null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async getIndex(): Promise<MiniSearch<SearchDocument>> {
    const vaultMtime = await this.getVaultMtime();

    if (this.state && this.state.vaultMtime >= vaultMtime) {
      return this.state.index;
    }

    this.state = await this.buildIndex();
    return this.state.index;
  }

  private async getVaultMtime(): Promise<number> {
    try {
      const stat = await fs.stat(this.vaultRoot);
      return stat.mtimeMs;
    } catch (err) {
      throw new SearchIndexError(
        `Cannot stat vault root "${this.vaultRoot}": ${String(err)}`,
      );
    }
  }

  private async buildIndex(): Promise<IndexState> {
    const miniSearch = new MiniSearch<SearchDocument>({
      idField: 'id',
      fields: ['title', 'content', 'tags'],
      storeFields: ['title', 'content', 'tags', 'path'],
      searchOptions: {
        boost: { title: 3, tags: 2 },
        fuzzy: 0.2,
      },
    });

    const docs = await this.collectDocuments(this.vaultRoot);

    try {
      miniSearch.addAll(docs);
    } catch (err) {
      throw new SearchIndexError(`Failed to build search index: ${String(err)}`);
    }

    const vaultMtime = await this.getVaultMtime();

    return {
      index: miniSearch,
      builtAt: Date.now(),
      vaultMtime,
    };
  }

  private async collectDocuments(dir: string): Promise<SearchDocument[]> {
    const docs: SearchDocument[] = [];
    await this.walkDir(dir, docs);
    return docs;
  }

  private async walkDir(
    dir: string,
    docs: SearchDocument[],
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories silently
    }

    const tasks: Promise<void>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden files/folders (e.g. .obsidian, .trash)
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        tasks.push(this.walkDir(fullPath, docs));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        tasks.push(this.indexFile(fullPath, docs));
      }
    }

    await Promise.all(tasks);
  }

  private async indexFile(
    filePath: string,
    docs: SearchDocument[],
  ): Promise<void> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = NoteParser.parse(raw);
      const relativePath = path.relative(this.vaultRoot, filePath);
      const title =
        NoteParser.extractTitle(parsed, path.basename(filePath, '.md'));
      const tags = NoteParser.extractTags(parsed).join(' ');

      docs.push({
        id: relativePath,
        title,
        content: parsed.body,
        tags,
        path: relativePath,
      });
    } catch {
      // Skip unreadable files silently
    }
  }
}
