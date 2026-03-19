/**
 * Integration tests for MCP tools — tests the full tool handler pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultManager } from '../src/vault/VaultManager.js';
import { readNote } from '../src/tools/readNote.js';
import { writeNote } from '../src/tools/writeNote.js';
import { appendNote } from '../src/tools/appendNote.js';
import { deleteNote } from '../src/tools/deleteNote.js';
import { listNotes } from '../src/tools/listNotes.js';
import { searchNotes } from '../src/tools/searchNotes.js';
import { getBacklinks } from '../src/tools/getBacklinks.js';
import { createDailyNote } from '../src/tools/createDailyNote.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-tools-test-'));
}

async function writeFile(vaultRoot: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('read_note tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('returns content and frontmatter', async () => {
    await writeFile(vaultRoot, 'test.md', '---\ntitle: Hello\n---\n\n# Hello\n\nWorld.');
    const result = await readNote(vault, { path: 'test.md' });

    expect(result.content).toContain('Hello');
    expect(result.frontmatter['title']).toBe('Hello');
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('write_note tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('creates a new note successfully', async () => {
    const result = await writeNote(vault, {
      path: 'Projects/todo.md',
      content: '# Todo\n\n- Item 1',
      frontmatter: { tags: ['todo'] },
      overwrite: false,
    });

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);

    const content = await fs.readFile(path.join(vaultRoot, 'Projects/todo.md'), 'utf8');
    expect(content).toContain('# Todo');
    expect(content).toContain('- todo');
  });
});

describe('append_note tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('appends content successfully', async () => {
    await writeFile(vaultRoot, 'log.md', '# Log\n\n## Entries\n\nFirst entry.\n\n## Notes\n\nSome notes.');

    const result = await appendNote(vault, {
      path: 'log.md',
      content: 'Second entry.',
      section: 'Entries',
    });

    expect(result.success).toBe(true);
    expect(result.newWordCount).toBeGreaterThan(0);

    const content = await fs.readFile(path.join(vaultRoot, 'log.md'), 'utf8');
    const entriesIdx = content.indexOf('## Entries');
    const notesIdx = content.indexOf('## Notes');
    const secondIdx = content.indexOf('Second entry.');

    expect(secondIdx).toBeGreaterThan(entriesIdx);
    expect(secondIdx).toBeLessThan(notesIdx);
  });
});

describe('delete_note tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('moves note to trash when confirmed', async () => {
    await writeFile(vaultRoot, 'delete-me.md', '# Delete Me');
    const result = await deleteNote(vault, { path: 'delete-me.md', confirm: true });

    expect(result.success).toBe(true);

    const gone = await fs.access(path.join(vaultRoot, 'delete-me.md')).then(() => false).catch(() => true);
    expect(gone).toBe(true);
  });
});

describe('list_notes tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('returns note metadata', async () => {
    await writeFile(
      vaultRoot,
      'meta.md',
      '---\ntitle: Meta Test\ntags: [test]\n---\n\n# Meta Test\n\nContent here.',
    );

    const result = await listNotes(vault, { recursive: true, limit: 10 });
    expect(result.notes.length).toBe(1);

    const note = result.notes[0];
    expect(note.path).toBe('meta.md');
    expect(note.title).toBe('Meta Test');
    expect(note.tags).toContain('test');
    expect(note.wordCount).toBeGreaterThan(0);
  });
});

describe('search_notes tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('finds notes by full-text search', async () => {
    await writeFile(
      vaultRoot,
      'architecture.md',
      '---\ntitle: System Architecture\n---\n\nMicroservices with event-driven design.',
    );

    const result = await searchNotes(vault, { query: 'microservices' });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].path).toBe('architecture.md');
  });

  it('returns excerpts with matched term', async () => {
    await writeFile(
      vaultRoot,
      'note.md',
      '# Note\n\nThe concept of recursion is fundamental in algorithms.',
    );

    const result = await searchNotes(vault, { query: 'recursion' });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].excerpt).toContain('**');
  });
});

describe('get_backlinks tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('finds wikilink backlinks', async () => {
    await writeFile(vaultRoot, 'target.md', '# Target Note');
    await writeFile(
      vaultRoot,
      'source.md',
      '# Source\n\nThis references [[target]] in context.',
    );

    const result = await getBacklinks(vault, { path: 'target.md' });
    expect(result.backlinks.length).toBe(1);
    expect(result.backlinks[0].fromPath).toBe('source.md');
    expect(result.backlinks[0].context).toContain('target');
  });

  it('finds markdown link backlinks', async () => {
    await writeFile(vaultRoot, 'target.md', '# Target');
    await writeFile(
      vaultRoot,
      'linker.md',
      '# Linker\n\nSee [target note](target.md) for details.',
    );

    const result = await getBacklinks(vault, { path: 'target.md' });
    expect(result.backlinks.length).toBe(1);
    expect(result.backlinks[0].fromPath).toBe('linker.md');
  });

  it('returns empty array when no backlinks exist', async () => {
    await writeFile(vaultRoot, 'lonely.md', '# No Links Here');
    const result = await getBacklinks(vault, { path: 'lonely.md' });
    expect(result.backlinks).toEqual([]);
  });
});

describe('create_daily_note tool', () => {
  let vault: VaultManager;
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('creates a daily note for a specific date', async () => {
    const result = await createDailyNote(vault, { date: '2024-03-15' });

    expect(result.path).toBe('Daily Notes/2024-03-15.md');
    expect(result.alreadyExisted).toBe(false);

    const content = await fs.readFile(
      path.join(vaultRoot, 'Daily Notes/2024-03-15.md'),
      'utf8',
    );
    expect(content).toContain('2024-03-15');
  });

  it('returns alreadyExisted: true when note exists', async () => {
    await writeFile(vaultRoot, 'Daily Notes/2024-03-15.md', '# 2024-03-15');

    const result = await createDailyNote(vault, { date: '2024-03-15' });
    expect(result.alreadyExisted).toBe(true);
  });

  it('applies template tokens when template path given', async () => {
    await writeFile(
      vaultRoot,
      'Templates/Daily.md',
      '# {{title}}\n\nDate: {{date}}\nTime: {{time}}\n\n## Tasks',
    );

    const result = await createDailyNote(vault, {
      date: '2024-06-01',
      template: 'Templates/Daily.md',
    });

    const content = await fs.readFile(
      path.join(vaultRoot, result.path),
      'utf8',
    );
    expect(content).toContain('# 2024-06-01');
    expect(content).toContain('Date: 2024-06-01');
    expect(content).not.toContain('{{date}}');
    expect(content).not.toContain('{{title}}');
  });

  it('appends additionalContent to the note', async () => {
    const result = await createDailyNote(vault, {
      date: '2024-07-04',
      additionalContent: '## Meeting Notes\n\n- Discussed roadmap.',
    });

    const content = await fs.readFile(
      path.join(vaultRoot, result.path),
      'utf8',
    );
    expect(content).toContain('Meeting Notes');
    expect(content).toContain('Discussed roadmap.');
  });
});
