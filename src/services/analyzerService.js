import { exec } from 'child_process';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace directories
const WORKSPACE_DIR = path.join(__dirname, '../..');
const CLONE_DIR = path.join(WORKSPACE_DIR, 'cloned_repos');
const CACHE_DIR = path.join(WORKSPACE_DIR, '.devpilot-cache');

// Expose mock overrides for test isolation
export const mockOverrides = {};

/**
 * Ensures required directories exist inside the workspace
 */
async function ensureDirs() {
  if (!existsSync(CLONE_DIR)) {
    await fs.mkdir(CLONE_DIR, { recursive: true });
  }
  if (!existsSync(CACHE_DIR)) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
}

/**
 * Execute a command line string helper
 * @param {string} command 
 * @param {string} cwd 
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Clone a git repository into the workspace clone folder
 * @param {string} gitUrl - HTTPS git url
 * @returns {Promise<{repoPath: string, repoName: string}>}
 */
export async function cloneRepository(gitUrl) {
  if (mockOverrides.cloneRepository) return mockOverrides.cloneRepository(gitUrl);

  await ensureDirs();
  
  // Extract repo name from Git URL (e.g. https://github.com/user/repo.git -> repo)
  const repoName = gitUrl.replace(/\.git$/, '').split('/').pop() || 'temp_repo_' + Date.now();
  const repoPath = path.join(CLONE_DIR, repoName);

  if (existsSync(repoPath)) {
    // If it exists, pull latest changes instead of cloning
    try {
      console.log(`Repository already exists. Pulling updates in ${repoPath}...`);
      await execCommand('git pull', repoPath);
      return { repoPath, repoName };
    } catch (err) {
      console.warn(`Git pull failed: ${err.message}. Cleaning and re-cloning...`);
      await fs.rm(repoPath, { recursive: true, force: true });
    }
  }

  console.log(`Cloning ${gitUrl} into ${repoPath}...`);
  await execCommand(`git clone ${gitUrl} "${repoPath}"`, WORKSPACE_DIR);
  return { repoPath, repoName };
}

/**
 * Recursively search for and read code files in the directory
 * @param {string} dirPath 
 * @param {string} relativeDir 
 * @returns {Promise<Array<{path: string, absolutePath: string, size: number, content: string}>>}
 */
export async function readCodeFiles(dirPath, relativeDir = '') {
  if (mockOverrides.readCodeFiles) return mockOverrides.readCodeFiles(dirPath, relativeDir);

  const baseDir = relativeDir ? path.join(dirPath, relativeDir) : dirPath;
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const files = [];

  // Exclude list
  const ignoredFolders = ['.git', 'node_modules', 'dist', 'build', '.devpilot-cache', 'cloned_repos', 'coverage'];
  const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.html', '.css', '.md', '.json', '.yml', '.yaml'];

  for (const entry of entries) {
    const entryName = entry.name;
    const relPath = relativeDir ? path.join(relativeDir, entryName) : entryName;
    const absPath = path.join(dirPath, relPath);

    if (entry.isDirectory()) {
      if (ignoredFolders.includes(entryName)) continue;
      const subFiles = await readCodeFiles(dirPath, relPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entryName).toLowerCase();
      if (!supportedExtensions.includes(ext)) continue;

      try {
        const stats = await fs.stat(absPath);
        // Limit processing to files under 1MB to avoid memory/token limits
        if (stats.size > 1024 * 1024) continue;

        const content = await fs.readFile(absPath, 'utf8');
        files.push({
          path: relPath.replace(/\\/g, '/'), // Use unix style paths
          absolutePath: absPath,
          size: stats.size,
          content
        });
      } catch (err) {
        console.error(`Failed to read file ${absPath}:`, err.message);
      }
    }
  }

  return files;
}

/**
 * Chunk file content into smaller overlapping pieces
 * @param {string} filePath 
 * @param {string} content 
 * @param {number} [chunkSize=700] - Target characters per chunk
 * @param {number} [chunkOverlap=150] - Character overlap between chunks
 */
export function chunkFileContent(filePath, content, chunkSize = 700, chunkOverlap = 150) {
  if (mockOverrides.chunkFileContent) return mockOverrides.chunkFileContent(filePath, content, chunkSize, chunkOverlap);

  const chunks = [];
  const lines = content.split(/\r?\n/);
  
  let currentChunkLines = [];
  let currentChunkLength = 0;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunkLines.push(line);
    currentChunkLength += line.length + 1; // +1 for newline character

    if (currentChunkLength >= chunkSize || i === lines.length - 1) {
      const chunkText = currentChunkLines.join('\n');
      const endLine = i + 1;
      
      chunks.push({
        content: chunkText,
        startLine,
        endLine
      });

      // Calculate overlap lines
      let overlapLength = 0;
      const overlapLines = [];
      
      // Build overlapping section from the end of the current chunk lines
      for (let j = currentChunkLines.length - 1; j >= 0; j--) {
        const overlapLine = currentChunkLines[j];
        if (overlapLength + overlapLine.length > chunkOverlap && overlapLines.length > 0) {
          break;
        }
        overlapLines.unshift(overlapLine);
        overlapLength += overlapLine.length + 1;
      }

      currentChunkLines = overlapLines;
      currentChunkLength = overlapLength;
      startLine = endLine - currentChunkLines.length + 1;
    }
  }

  return chunks;
}

/**
 * Extract programming language and structural metadata from code content
 * @param {string} filePath 
 * @param {string} chunkContent 
 * @returns {Object} Metadata object
 */
export function extractMetadata(filePath, chunkContent) {
  if (mockOverrides.extractMetadata) return mockOverrides.extractMetadata(filePath, chunkContent);

  const ext = path.extname(filePath).toLowerCase();
  
  // Mapping extension to language name
  const langMap = {
    '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.go': 'go',
    '.rs': 'rust', '.java': 'java',
    '.cpp': 'cpp', '.c': 'c',
    '.html': 'html', '.css': 'css',
    '.md': 'markdown', '.json': 'json',
    '.yml': 'yaml', '.yaml': 'yaml'
  };
  const language = langMap[ext] || 'text';

  // Basic structural detections using simple expressions
  const functions = [];
  const classes = [];

  // Match function, class, export statements, and class methods (avoiding keywords)
  const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>|def\s+(\w+)\(|func\s+(\w+)\()|(?:\b(?!(?:if|for|while|switch|catch|with|return|function|class|const|let|var)\b)(\w+)\s*\([^)]*\)\s*\{)/g;
  const classRegex = /(?:class\s+(\w+))/g;

  let match;
  while ((match = funcRegex.exec(chunkContent)) !== null) {
    const fnName = match[1] || match[2] || match[3] || match[4] || match[5];
    if (fnName) functions.push(fnName);
  }

  while ((match = classRegex.exec(chunkContent)) !== null) {
    if (match[1]) classes.push(match[1]);
  }

  return {
    language,
    functions: [...new Set(functions)].slice(0, 10), // Limit array
    classes: [...new Set(classes)].slice(0, 5)
  };
}

/**
 * Generate vector embeddings for text chunks
 * Supports fallback to dummy random normalized vector when Gemini API is unconfigured
 * @param {string[]} texts 
 * @returns {Promise<number[][]>} Arrays of embeddings (1536 floats normalized)
 */
export async function generateEmbeddings(texts) {
  if (mockOverrides.generateEmbeddings) return mockOverrides.generateEmbeddings(texts);

  const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey; // Load from configuration

  if (apiKey) {
    try {
      const embeddings = [];
      for (const text of texts) {
        // Call official Google Gemini Developer API text-embedding-004 endpoint
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: {
              parts: [{ text }]
            }
          })
        });

        const data = await response.json();
        if (data.embedding && data.embedding.values) {
          embeddings.push(data.embedding.values);
        } else {
          throw new Error(data.error?.message || 'Failed to fetch embedding');
        }
      }
      return embeddings;
    } catch (err) {
      console.warn(`Gemini Embedding API call failed: ${err.message}. Falling back to mock embeddings.`);
    }
  }

  // Fallback mock embedding generator (Normalized floats biased by word frequency for semantic search tests)
  return texts.map(text => {
    const vec = new Array(1536).fill(0);
    
    // Hash function to map words to indices in 1536-dim space
    const getIndex = (word) => {
      let h = 0;
      for (let i = 0; i < word.length; i++) {
        h = (h * 31 + word.charCodeAt(i)) % 1536;
      }
      return Math.abs(h);
    };

    // Parse words and bias indices in vector space
    const words = text.toLowerCase().split(/[^a-z0-9]+/);
    for (const word of words) {
      if (word.length > 1) {
        const idx = getIndex(word);
        vec[idx] += 1.0;
      }
    }

    // Generate deterministic background values using SHA-256 text hash
    const hash = crypto.createHash('sha256').update(text).digest();
    let sumSq = 0;
    for (let i = 0; i < 1536; i++) {
      const val = ((hash.readInt8(i % 32) / 128.0) * (i + 1)) % 1;
      // Mix semantic bag-of-words data with deterministic noise
      vec[i] = vec[i] * 10.0 + val * 0.1;
      sumSq += vec[i] * vec[i];
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(sumSq) || 1;
    return vec.map(v => v / magnitude);
  });
}

/**
 * Generate checksum/hash of a string
 * @param {string} str 
 */
function getMD5Hash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Load index cache file for a repository
 * @param {string} repoName 
 * @returns {Promise<Object>} Cached data or new cache shell
 */
export async function getCache(repoName) {
  await ensureDirs();
  const cachePath = path.join(CACHE_DIR, `${repoName}.json`);
  if (existsSync(cachePath)) {
    try {
      const content = await fs.readFile(cachePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`Failed to parse cache at ${cachePath}:`, err.message);
    }
  }
  return { repoName, files: {} };
}

/**
 * Save index cache file
 * @param {string} repoName 
 * @param {Object} cacheData 
 */
export async function saveCache(repoName, cacheData) {
  await ensureDirs();
  const cachePath = path.join(CACHE_DIR, `${repoName}.json`);
  await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
}

/**
 * Scan, Chunk, Embed and Cache a Repository
 * @param {string} repoPath 
 * @param {string} repoName 
 * @param {Function} [progressCallback] 
 */
export async function analyzeRepository(repoPath, repoName, progressCallback = () => {}) {
  if (mockOverrides.analyzeRepository) return mockOverrides.analyzeRepository(repoPath, repoName, progressCallback);

  progressCallback({ status: 'scanning', message: 'Scanning code files...' });
  const files = await readCodeFiles(repoPath);
  
  progressCallback({ status: 'caching', message: 'Checking index cache...' });
  const cache = await getCache(repoName);
  const updatedCache = { repoName, files: {} };

  let totalFiles = files.length;
  let fileIndex = 0;

  for (const file of files) {
    fileIndex++;
    const currentHash = getMD5Hash(file.content);
    const cachedFile = cache.files[file.path];

    if (cachedFile && cachedFile.hash === currentHash) {
      // Cache Hit! Retrieve from cache directly
      console.log(`Cache Hit for ${file.path}. Reusing chunks.`);
      updatedCache.files[file.path] = cachedFile;
      progressCallback({
        status: 'analyzing',
        message: `Processing file ${fileIndex}/${totalFiles}: ${file.path} (Cached)`,
        progress: Math.round((fileIndex / totalFiles) * 100)
      });
      continue;
    }

    // Cache Miss! Process file
    progressCallback({
      status: 'analyzing',
      message: `Processing file ${fileIndex}/${totalFiles}: ${file.path}`,
      progress: Math.round((fileIndex / totalFiles) * 100)
    });

    const rawChunks = chunkFileContent(file.path, file.content);
    
    if (rawChunks.length === 0) continue;

    // Generate embeddings for new chunks
    const chunkTexts = rawChunks.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    const processedChunks = rawChunks.map((chunk, idx) => {
      const metadata = extractMetadata(file.path, chunk.content);
      return {
        id: `${file.path}#${idx}`,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        metadata,
        embedding: embeddings[idx]
      };
    });

    updatedCache.files[file.path] = {
      path: file.path,
      hash: currentHash,
      size: file.size,
      chunksCount: processedChunks.length,
      chunks: processedChunks
    };

    // Periodically save cache to avoid losing progress
    if (fileIndex % 10 === 0 || fileIndex === totalFiles) {
      await saveCache(repoName, updatedCache);
    }
  }

  await saveCache(repoName, updatedCache);
  progressCallback({ status: 'completed', message: `Analysis complete! Indexed ${totalFiles} files.` });
  
  return updatedCache;
}

/**
 * Calculate Dot Product of two vectors
 */
function dotProduct(vecA, vecB) {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

/**
 * Calculate Cosine Similarity between two vectors
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} Float range -1.0 to 1.0
 */
export function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magA = Math.sqrt(normA);
  const magB = Math.sqrt(normB);
  
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/**
 * Semantic Vector Code Search
 * @param {string} repoName 
 * @param {string} queryText 
 * @param {number} [limit=5] 
 * @returns {Promise<Array<{file: string, startLine: number, endLine: number, content: string, similarity: number, metadata: Object}>>}
 */
export async function semanticSearch(repoName, queryText, limit = 5) {
  if (mockOverrides.semanticSearch) return mockOverrides.semanticSearch(repoName, queryText, limit);

  const cache = await getCache(repoName);
  const queryEmbedding = (await generateEmbeddings([queryText]))[0];
  const results = [];

  for (const fileKey of Object.keys(cache.files)) {
    const file = cache.files[fileKey];
    for (const chunk of file.chunks) {
      const similarity = calculateCosineSimilarity(queryEmbedding, chunk.embedding);
      results.push({
        file: file.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        similarity,
        metadata: chunk.metadata
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}
