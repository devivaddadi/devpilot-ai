import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.resolve(__dirname, '../..');

const customTools = new Map();

// --- Logger Utility ---
const logger = {
  info: (msg, meta = '') => console.log(`[Shared Tool Layer] INFO: ${msg}`, meta ? JSON.stringify(meta) : ''),
  warn: (msg, meta = '') => console.warn(`[Shared Tool Layer] WARN: ${msg}`, meta ? JSON.stringify(meta) : ''),
  error: (msg, err = '') => console.error(`[Shared Tool Layer] ERROR: ${msg}`, err.stack || err.message || err)
};

/**
 * Validates path lies inside the workspace sandbox boundaries
 * @param {string} relPath 
 * @returns {string} Absolute resolved path
 */
export function resolveSafePath(relPath) {
  const resolved = path.resolve(WORKSPACE_DIR, relPath);
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    throw new Error('Security Error: Access denied. File path lies outside the workspace directory sandbox.');
  }
  return resolved;
}

// --- 1. Secure File Operations ---
export const fileOps = {
  async readFile(relPath) {
    const absPath = resolveSafePath(relPath);
    if (!existsSync(absPath)) {
      throw new Error(`File does not exist: ${relPath}`);
    }
    return await fs.readFile(absPath, 'utf8');
  },

  async writeFile(relPath, content) {
    const absPath = resolveSafePath(relPath);
    const dir = path.dirname(absPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(absPath, content, 'utf8');
    return true;
  },

  exists(relPath) {
    try {
      const absPath = resolveSafePath(relPath);
      return existsSync(absPath);
    } catch {
      return false; // Traversal attempt returns false
    }
  }
};

// --- 2. Code Parsing Utilities ---
export const parser = {
  /**
   * Extract fenced code blocks from markdown text
   * @param {string} mdText 
   * @returns {Array<{language: string, content: string}>}
   */
  extractCodeBlocks(mdText) {
    if (!mdText) return [];
    const blockRegex = /```([a-zA-Z0-9+#_.]+)?\r?\n([\s\S]+?)\r?\n```/g;
    const blocks = [];
    let match;

    while ((match = blockRegex.exec(mdText)) !== null) {
      blocks.push({
        language: (match[1] || 'text').trim().toLowerCase(),
        content: match[2]
      });
    }
    return blocks;
  },

  /**
   * Detect programming language based on file extension
   * @param {string} filePath 
   * @returns {string}
   */
  detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mapping = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.sh': 'shell',
      '.bash': 'shell',
      '.json': 'json',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css'
    };
    return mapping[ext] || 'text';
  }
};

// --- 3. Markdown Generation Utilities ---
export const markdown = {
  /**
   * Generates a markdown table
   * @param {Array<string>} headers 
   * @param {Array<Array<string>>} rows 
   * @returns {string}
   */
  generateTable(headers, rows = []) {
    if (!headers || headers.length === 0) return '';
    
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');

    return `${headerRow}\n${separatorRow}${bodyRows ? '\n' : ''}${bodyRows}`;
  },

  /**
   * Generates a GitHub flavored markdown alert block
   * @param {'NOTE'|'TIP'|'IMPORTANT'|'WARNING'|'CAUTION'} type 
   * @param {string} message 
   */
  generateAlert(type, message) {
    const allowed = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
    const alertType = allowed.includes(type.toUpperCase()) ? type.toUpperCase() : 'NOTE';
    return `> [!${alertType}]\n> ${message.replace(/\n/g, '\n> ')}`;
  },

  /**
   * Generates a details disclosure block
   * @param {string} summary 
   * @param {string} content 
   */
  generateCollapsible(summary, content) {
    return `<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>`;
  }
};

// --- 4. Extensible Custom Tools Registry ---

/**
 * Register a custom tool
 * @param {string} name 
 * @param {Function} fn 
 */
export function registerTool(name, fn) {
  if (typeof fn !== 'function') {
    throw new Error('Tool must be a valid executable function.');
  }
  customTools.set(name, fn);
  logger.info(`Custom tool registered: "${name}"`);
}

/**
 * Retrieve a registered tool
 * @param {string} name 
 * @returns {Function|null}
 */
export function getTool(name) {
  return customTools.get(name) || null;
}

/**
 * Wipes registered custom tools (for test isolation)
 */
export function clearTools() {
  customTools.clear();
}
