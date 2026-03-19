/**
 * Custom error hierarchy for the Obsidian MCP Server.
 *
 * VaultError (base)
 *   ├── NoteNotFoundError
 *   ├── NoteConflictError
 *   ├── VaultSecurityError
 *   └── SearchIndexError
 */

export class VaultError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'VAULT_ERROR') {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    // Maintain proper prototype chain in transpiled ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NoteNotFoundError extends VaultError {
  public readonly notePath: string;

  constructor(notePath: string) {
    super(`Note not found: "${notePath}"`, 'NOTE_NOT_FOUND');
    this.name = 'NoteNotFoundError';
    this.notePath = notePath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NoteConflictError extends VaultError {
  public readonly notePath: string;

  constructor(notePath: string) {
    super(
      `Note already exists at "${notePath}". Use overwrite: true to replace it.`,
      'NOTE_CONFLICT',
    );
    this.name = 'NoteConflictError';
    this.notePath = notePath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VaultSecurityError extends VaultError {
  public readonly attemptedPath: string;

  constructor(attemptedPath: string) {
    super(
      `Path traversal attempt blocked: "${attemptedPath}" resolves outside the vault root.`,
      'VAULT_SECURITY_ERROR',
    );
    this.name = 'VaultSecurityError';
    this.attemptedPath = attemptedPath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SearchIndexError extends VaultError {
  constructor(message: string) {
    super(`Search index error: ${message}`, 'SEARCH_INDEX_ERROR');
    this.name = 'SearchIndexError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidConfirmationError extends VaultError {
  constructor(operation: string) {
    super(
      `Operation "${operation}" requires confirm: true to proceed.`,
      'INVALID_CONFIRMATION',
    );
    this.name = 'InvalidConfirmationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Converts any error into a human-readable MCP error message string.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof VaultError) {
    return `[${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
