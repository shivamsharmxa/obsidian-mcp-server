/**
 * Tests for SearchIndex — index building, searching, invalidation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SearchIndex } from '../src/vault/SearchIndex.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-search-test-'));
}

async function writeNote(
  vaultRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  const absPath = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SearchIndex', () => {
  let vaultRoot: string;
  let index: SearchIndex;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    index = new SearchIndex(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('finds a note by keyword in content', async () => {
    await writeNote(
      vaultRoot,
      'quantum.md',
      '---\ntitle: Quantum Computing\n---\n\nQuantum entanglement is a fascinating phenomenon.',
    );

    const results = await index.search('quantum entanglement');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('quantum.md');
  });

  it('finds notes by title match', async () => {
    await writeNote(vaultRoot, 'typescript-tips.md', '---\ntitle: TypeScript Tips\n---\n\nSome content.');
    await writeNote(vaultRoot, 'python-guide.md', '---\ntitle: Python Guide\n---\n\nSome content.');

    const results = await index.search('TypeScript', { searchIn: ['title'] });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('TypeScript Tips');
  });

  it('finds notes by tag', async () => {
    await writeNote(
      vaultRoot,
      'tagged.md',
      '---\ntitle: Tagged Note\ntags: [javascript, webdev]\n---\n\nContent.',
    );
    await writeNote(vaultRoot, 'other.md', '---\ntitle: Other\n---\n\nContent.');

    const results = await index.search('javascript', { searchIn: ['tags'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('tagged.md');
  });

  it('filters results by tag pre-filter', async () => {
    await writeNote(
      vaultRoot,
      'project-a.md',
      '---\ntitle: Project A\ntags: [project]\n---\n\nPlanning notes for project.',
    );
    await writeNote(
      vaultRoot,
      'project-b.md',
      '---\ntitle: Project B\ntags: [archive]\n---\n\nOld planning notes.',
    );

    const results = await index.search('planning', { tag: 'project' });
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('project-a.md');
  });

  it('returns results with excerpts', async () => {
    await writeNote(
      vaultRoot,
      'note.md',
      '# Note\n\nThis is a long paragraph about machine learning and neural networks. Very interesting.',
    );

    const results = await index.search('machine learning');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].excerpt).toBeTruthy();
    expect(results[0].excerpt.length).toBeGreaterThan(0);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await writeNote(vaultRoot, `note${i}.md`, `# Note ${i}\n\nKeyword match content.`);
    }

    const results = await index.search('keyword', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array when nothing matches', async () => {
    await writeNote(vaultRoot, 'unrelated.md', '# Unrelated\n\nFoo bar baz.');

    const results = await index.search('xyzabcdef12345');
    expect(results).toEqual([]);
  });

  it('rebuilds index on demand', async () => {
    await writeNote(vaultRoot, 'before.md', '# Before\n\nInitial content.');

    const before = await index.search('Initial');
    expect(before.length).toBe(1);

    // Add a new note and rebuild
    await writeNote(vaultRoot, 'after.md', '# After\n\nNewcontent added later.');
    await index.rebuild();

    const after = await index.search('Newcontent');
    expect(after.length).toBe(1);
    expect(after[0].path).toBe('after.md');
  });

  it('skips hidden directories when building index', async () => {
    await writeNote(vaultRoot, '.obsidian/config.md', '# Config\n\nSensitive configuration.');
    await writeNote(vaultRoot, 'public.md', '# Public\n\nNormal note.');

    const results = await index.search('Sensitive');
    expect(results.length).toBe(0);
  });
});
