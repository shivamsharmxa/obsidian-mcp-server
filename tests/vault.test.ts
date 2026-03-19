/**
 * Tests for VaultManager — path safety, read, write, append, delete, list.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultManager } from '../src/vault/VaultManager.js';
import {
  NoteNotFoundError,
  NoteConflictError,
  VaultSecurityError,
  InvalidConfirmationError,
} from '../src/errors.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTempVault(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-test-'));
}

async function writeFile(vaultRoot: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(vaultRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VaultManager — path safety', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('should resolve safe relative paths', () => {
    const resolved = vault.resolvePath('Notes/test.md');
    expect(resolved.startsWith(vaultRoot)).toBe(true);
  });

  it('should throw VaultSecurityError for path traversal', () => {
    expect(() => vault.resolvePath('../../etc/passwd')).toThrow(VaultSecurityError);
  });

  it('should throw VaultSecurityError for absolute paths outside vault', () => {
    expect(() => vault.resolvePath('/etc/passwd')).toThrow(VaultSecurityError);
  });

  it('isInsideVault returns true for vault children', () => {
    expect(vault.isInsideVault(path.join(vaultRoot, 'foo', 'bar.md'))).toBe(true);
  });

  it('isInsideVault returns false for paths outside', () => {
    expect(vault.isInsideVault('/tmp/outside.md')).toBe(false);
  });
});

describe('VaultManager — readNote', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('reads a plain markdown note', async () => {
    await writeFile(vaultRoot, 'test.md', '# Hello\n\nWorld');
    const result = await vault.readNote('test.md');
    expect(result.content).toContain('Hello');
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.lastModified).toBeTruthy();
  });

  it('parses frontmatter from note', async () => {
    await writeFile(
      vaultRoot,
      'note.md',
      '---\ntitle: My Note\ntags: [a, b]\n---\n\nBody text here.',
    );
    const result = await vault.readNote('note.md');
    expect(result.frontmatter['title']).toBe('My Note');
    expect(result.frontmatter['tags']).toEqual(['a', 'b']);
    expect(result.content).toContain('Body text here');
    expect(result.content).not.toContain('---');
  });

  it('throws NoteNotFoundError for missing note', async () => {
    await expect(vault.readNote('nonexistent.md')).rejects.toThrow(NoteNotFoundError);
  });
});

describe('VaultManager — writeNote', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('creates a new note', async () => {
    const result = await vault.writeNote('new.md', '# New Note\n\nContent here.');
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);

    const content = await fs.readFile(path.join(vaultRoot, 'new.md'), 'utf8');
    expect(content).toContain('Content here.');
  });

  it('creates intermediate directories', async () => {
    await vault.writeNote('deep/folder/note.md', '# Deep Note');
    const exists = await fs.access(path.join(vaultRoot, 'deep/folder/note.md')).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('throws NoteConflictError when overwrite is false and file exists', async () => {
    await writeFile(vaultRoot, 'existing.md', '# Existing');
    await expect(
      vault.writeNote('existing.md', '# New content', undefined, false),
    ).rejects.toThrow(NoteConflictError);
  });

  it('overwrites when overwrite is true', async () => {
    await writeFile(vaultRoot, 'existing.md', '# Old');
    const result = await vault.writeNote('existing.md', '# New', undefined, true);
    expect(result.created).toBe(false);

    const content = await fs.readFile(path.join(vaultRoot, 'existing.md'), 'utf8');
    expect(content).toContain('# New');
  });

  it('writes frontmatter correctly', async () => {
    await vault.writeNote('fm.md', 'Body', { title: 'Test', tags: ['x'] });
    const content = await fs.readFile(path.join(vaultRoot, 'fm.md'), 'utf8');
    expect(content).toContain('title: Test');
    expect(content).toContain('- x');
  });
});

describe('VaultManager — appendNote', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('appends to end of note', async () => {
    await writeFile(vaultRoot, 'note.md', '# Title\n\nFirst paragraph.');
    const result = await vault.appendNote('note.md', 'Appended line.');
    expect(result.success).toBe(true);

    const content = await fs.readFile(path.join(vaultRoot, 'note.md'), 'utf8');
    expect(content).toContain('Appended line.');
    expect(content.indexOf('First paragraph.')).toBeLessThan(content.indexOf('Appended line.'));
  });

  it('appends under a specific section', async () => {
    const noteContent = '# Title\n\n## Tasks\n\n- existing task\n\n## Notes\n\nSome notes.';
    await writeFile(vaultRoot, 'note.md', noteContent);

    await vault.appendNote('note.md', '- new task', 'Tasks');

    const content = await fs.readFile(path.join(vaultRoot, 'note.md'), 'utf8');
    const tasksIdx = content.indexOf('## Tasks');
    const notesIdx = content.indexOf('## Notes');
    const newTaskIdx = content.indexOf('- new task');

    expect(newTaskIdx).toBeGreaterThan(tasksIdx);
    expect(newTaskIdx).toBeLessThan(notesIdx);
  });

  it('throws NoteNotFoundError for missing note', async () => {
    await expect(vault.appendNote('missing.md', 'content')).rejects.toThrow(NoteNotFoundError);
  });
});

describe('VaultManager — deleteNote', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('moves note to .trash when confirmed', async () => {
    await writeFile(vaultRoot, 'tobedeleted.md', '# Delete Me');
    const result = await vault.deleteNote('tobedeleted.md', true);
    expect(result.success).toBe(true);

    // Original file should be gone
    const originalExists = await fs.access(path.join(vaultRoot, 'tobedeleted.md')).then(() => true).catch(() => false);
    expect(originalExists).toBe(false);

    // .trash should exist
    const trashEntries = await fs.readdir(path.join(vaultRoot, '.trash'));
    expect(trashEntries.length).toBeGreaterThan(0);
  });

  it('throws InvalidConfirmationError when confirm is false', async () => {
    await writeFile(vaultRoot, 'note.md', '# Note');
    await expect(vault.deleteNote('note.md', false)).rejects.toThrow(InvalidConfirmationError);
  });

  it('throws NoteNotFoundError for missing note', async () => {
    await expect(vault.deleteNote('missing.md', true)).rejects.toThrow(NoteNotFoundError);
  });
});

describe('VaultManager — listNotes', () => {
  let vaultRoot: string;
  let vault: VaultManager;

  beforeEach(async () => {
    vaultRoot = await createTempVault();
    vault = new VaultManager(vaultRoot);
  });

  afterEach(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  it('lists all notes recursively', async () => {
    await writeFile(vaultRoot, 'a.md', '# A');
    await writeFile(vaultRoot, 'sub/b.md', '# B');
    await writeFile(vaultRoot, 'sub/deep/c.md', '# C');

    const notes = await vault.listNotes({ recursive: true });
    expect(notes.length).toBe(3);
  });

  it('lists notes non-recursively', async () => {
    await writeFile(vaultRoot, 'root.md', '# Root');
    await writeFile(vaultRoot, 'sub/nested.md', '# Nested');

    const notes = await vault.listNotes({ recursive: false });
    expect(notes.length).toBe(1);
    expect(notes[0].path).toBe('root.md');
  });

  it('filters by tag', async () => {
    await writeFile(vaultRoot, 'tagged.md', '---\ntags: [project]\n---\n\n# Tagged');
    await writeFile(vaultRoot, 'untagged.md', '# Untagged');

    const notes = await vault.listNotes({ tag: 'project' });
    expect(notes.length).toBe(1);
    expect(notes[0].path).toBe('tagged.md');
  });

  it('filters by folder', async () => {
    await writeFile(vaultRoot, 'root.md', '# Root');
    await writeFile(vaultRoot, 'Projects/a.md', '# A');
    await writeFile(vaultRoot, 'Projects/b.md', '# B');

    const notes = await vault.listNotes({ folder: 'Projects' });
    expect(notes.length).toBe(2);
  });

  it('respects the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await writeFile(vaultRoot, `note${i}.md`, `# Note ${i}`);
    }
    const notes = await vault.listNotes({ limit: 3 });
    expect(notes.length).toBe(3);
  });

  it('sorts by lastModified descending', async () => {
    await writeFile(vaultRoot, 'old.md', '# Old');
    // Small delay to ensure different mtimes
    await new Promise((r) => setTimeout(r, 10));
    await writeFile(vaultRoot, 'new.md', '# New');

    const notes = await vault.listNotes({});
    expect(notes[0].path).toBe('new.md');
  });
});
