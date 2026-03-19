# obsidian-mcp-server

[![npm version](https://img.shields.io/npm/v/obsidian-mcp-server.svg)](https://www.npmjs.com/package/obsidian-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

A production-grade **Model Context Protocol (MCP) server** that connects [Claude.ai](https://claude.ai) to your local [Obsidian](https://obsidian.md) vault. Gives Claude full CRUD access to your notes, full-text fuzzy search, backlink resolution, frontmatter parsing, and daily note creation — all over the secure stdio transport.

---

## Prerequisites

- **Node.js** ≥ 20.0.0
- **npm** ≥ 9.0.0
- An existing [Obsidian](https://obsidian.md) vault on your local filesystem
- [Claude Desktop](https://claude.ai/download) (macOS, Windows, or Linux)

---

## Installation

### Option A — Clone & build locally

```bash
git clone https://github.com/yourusername/obsidian-mcp-server.git
cd obsidian-mcp-server
npm install
npm run build
```

### Option B — Install globally via npm *(once published)*

```bash
npm install -g obsidian-mcp-server
```

### Configure the vault path

```bash
cp .env.example .env
# Edit .env and set OBSIDIAN_VAULT_PATH to your vault directory
```

Or pass it on the CLI:

```bash
node dist/index.js --vault /path/to/your/vault
```

---

## Connecting to Claude Desktop

Add the server to your Claude Desktop config file.

### macOS

`~/Library/Application Support/Claude/claude_desktop_config.json`

### Windows

`%APPDATA%\Claude\claude_desktop_config.json`

### Linux

`~/.config/claude/claude_desktop_config.json`

---

### Config snippet (local build)

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp-server/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

### Config snippet (global npm install)

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "obsidian-mcp",
      "env": {
        "OBSIDIAN_VAULT_PATH": "/absolute/path/to/your/obsidian/vault"
      }
    }
  }
}
```

After editing the config, **restart Claude Desktop**. You should see the Obsidian tools available in the tools panel.

---

## Tools Reference

### 1. `read_note`

Read a note's body, frontmatter, word count, and last-modified timestamp.

**Input:**
```json
{
  "path": "Projects/MyNote.md"
}
```

**Output:**
```json
{
  "content": "# My Note\n\nMarkdown body without frontmatter...",
  "frontmatter": { "title": "My Note", "tags": ["project"] },
  "wordCount": 142,
  "lastModified": "2024-03-15T10:30:00.000Z"
}
```

---

### 2. `write_note`

Create or overwrite a note. Set `overwrite: true` to replace an existing note.

**Input:**
```json
{
  "path": "Projects/NewNote.md",
  "content": "# New Note\n\nContent here.",
  "frontmatter": { "tags": ["project", "active"] },
  "overwrite": false
}
```

**Output:**
```json
{
  "success": true,
  "path": "Projects/NewNote.md",
  "created": true
}
```

---

### 3. `append_note`

Append content to an existing note, optionally under a specific heading.

**Input:**
```json
{
  "path": "Daily Notes/2024-03-15.md",
  "content": "- Completed code review",
  "section": "Tasks"
}
```

**Output:**
```json
{
  "success": true,
  "newWordCount": 187
}
```

---

### 4. `delete_note`

Move a note to `.trash/` inside the vault (not permanent deletion). Requires `confirm: true`.

**Input:**
```json
{
  "path": "Archive/OldNote.md",
  "confirm": true
}
```

**Output:**
```json
{
  "success": true,
  "deletedPath": "Archive/OldNote.md"
}
```

---

### 5. `list_notes`

List notes with optional folder, tag, and recursion filters.

**Input:**
```json
{
  "folder": "Projects",
  "tag": "active",
  "recursive": true,
  "limit": 50
}
```

**Output:**
```json
{
  "notes": [
    {
      "path": "Projects/Alpha.md",
      "title": "Project Alpha",
      "tags": ["project", "active"],
      "lastModified": "2024-03-15T09:00:00.000Z",
      "wordCount": 320
    }
  ]
}
```

---

### 6. `search_notes`

Full-text fuzzy search with relevance scoring and highlighted excerpts.

**Input:**
```json
{
  "query": "machine learning neural network",
  "limit": 10,
  "searchIn": ["title", "content"],
  "tag": "research"
}
```

**Output:**
```json
{
  "results": [
    {
      "path": "Research/ML-Notes.md",
      "title": "ML Notes",
      "score": 14.2,
      "excerpt": "…backpropagation through **neural network** layers enables **machine learning** models to…",
      "tags": ["research", "ml"]
    }
  ]
}
```

---

### 7. `get_backlinks`

Find all notes that link to a given note via `[[WikiLinks]]` or `[text](path.md)`.

**Input:**
```json
{
  "path": "Concepts/Recursion.md"
}
```

**Output:**
```json
{
  "backlinks": [
    {
      "fromPath": "Algorithms/DFS.md",
      "fromTitle": "Depth-First Search",
      "context": "…DFS uses [[Recursion]] as its core mechanism for traversing…"
    }
  ]
}
```

---

### 8. `create_daily_note`

Create an Obsidian-style daily note at `Daily Notes/YYYY-MM-DD.md`.

**Input:**
```json
{
  "date": "2024-03-15",
  "template": "Templates/Daily.md",
  "additionalContent": "## Meeting Agenda\n\n- Sprint planning"
}
```

**Output:**
```json
{
  "path": "Daily Notes/2024-03-15.md",
  "alreadyExisted": false
}
```

Template tokens: `{{date}}` → `2024-03-15`, `{{time}}` → `09:30 AM`, `{{title}}` → `2024-03-15`.

---

## RAG Workflow Example

A typical **search → read → write** pattern for AI-augmented note-taking:

```
User: "Summarize all my notes tagged 'meeting' from this week and create a summary note."

Claude:
1. search_notes({ query: "meeting", tag: "meeting", limit: 20 })
   → finds 5 recent meeting notes

2. read_note({ path: "Meetings/2024-03-13.md" })
   read_note({ path: "Meetings/2024-03-14.md" })
   read_note({ path: "Meetings/2024-03-15.md" })
   → reads each note's content

3. write_note({
     path: "Summaries/Week-2024-03-11.md",
     content: "# Week Summary\n\n...",
     frontmatter: { tags: ["summary", "weekly"] }
   })
   → creates the summary note
```

---

## Security

### Path Traversal Protection

Every file path provided to the server is validated against the vault root:

1. The path is resolved with `path.resolve()` against the vault root.
2. The resolved absolute path is checked to ensure it **starts with** the vault root directory.
3. Any path that escapes the vault (e.g., `../../etc/passwd`, `/absolute/paths`) throws a `VaultSecurityError` and is rejected before any I/O occurs.

### Atomic Writes

All write operations use a **write-to-temp-then-rename** pattern:

1. Content is written to a `.tmp.PID.TIMESTAMP` file.
2. The temp file is atomically renamed to the final path.
3. On failure, the temp file is cleaned up.

This prevents partial writes from corrupting your notes.

### Trash Instead of Delete

`delete_note` moves notes to `.trash/` inside the vault rather than permanently deleting them. Notes can be recovered manually from that folder.

---

## Development

```bash
# Run in dev mode with hot reload
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Build for production
npm run build
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Ensure all tests pass: `npm test`
5. Ensure no type errors: `npm run typecheck`
6. Submit a pull request

Please follow the existing code style and ensure `exactOptionalPropertyTypes` strict mode is maintained.

---

## License

MIT License

Copyright (c) 2024 obsidian-mcp-server contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
