#!/usr/bin/env node
/**
 * Obsidian MCP Server — entry point.
 *
 * Boots an MCP server over stdio transport that exposes an Obsidian vault
 * as 8 structured tools Claude can call.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveConfig } from './config.js';
import { VaultManager } from './vault/VaultManager.js';
import { createReadNoteTool } from './tools/readNote.js';
import { createWriteNoteTool } from './tools/writeNote.js';
import { createAppendNoteTool } from './tools/appendNote.js';
import { createDeleteNoteTool } from './tools/deleteNote.js';
import { createListNotesTool } from './tools/listNotes.js';
import { createSearchNotesTool } from './tools/searchNotes.js';
import { createGetBacklinksTool } from './tools/getBacklinks.js';
import { createDailyNoteTool } from './tools/createDailyNote.js';

async function main(): Promise<void> {
  // ─── Config & Vault ────────────────────────────────────────────────────────
  const config = resolveConfig();
  const vault = new VaultManager(config.vaultPath);

  // ─── MCP Server ────────────────────────────────────────────────────────────
  const server = new McpServer({
    name: 'obsidian-mcp-server',
    version: '1.0.0',
  });

  // ─── Register Tools ────────────────────────────────────────────────────────
  const tools = [
    createReadNoteTool(vault),
    createWriteNoteTool(vault),
    createAppendNoteTool(vault),
    createDeleteNoteTool(vault),
    createListNotesTool(vault),
    createSearchNotesTool(vault),
    createGetBacklinksTool(vault),
    createDailyNoteTool(vault),
  ];

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema.shape, async (input: Record<string, unknown>) => {
      try {
        const text = await tool.handler(input as never);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  // ─── Transport ─────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so stdout stays clean for MCP protocol
  process.stderr.write(
    `[obsidian-mcp] Server running. Vault: ${config.vaultPath}\n`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[obsidian-mcp] Fatal error: ${message}\n`);
  process.exit(1);
});
