import { Router } from 'express';
import * as analyzerService from '../services/analyzerService.js';
import { existsSync } from 'fs';

const router = Router();

// In-memory status registry to track background repository analyses
const analysisStatus = {};

// --- Routes ---

// 1. Clone Repository
router.post('/clone', async (req, res) => {
  const { gitUrl } = req.body;
  if (!gitUrl) {
    return res.status(400).json({ error: 'gitUrl is required.' });
  }

  try {
    const result = await analyzerService.cloneRepository(gitUrl);
    
    // Initialize analysis status shell
    analysisStatus[result.repoName] = {
      status: 'cloned',
      message: 'Repository cloned successfully. Ready to analyze.',
      progress: 0,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      repoName: result.repoName,
      repoPath: result.repoPath,
      message: 'Repository cloned successfully.'
    });
  } catch (error) {
    console.error('Clone Error:', error);
    res.status(500).json({ error: `Failed to clone repository: ${error.message}` });
  }
});

// 2. Start Background Repository Analysis
router.post('/analyze', async (req, res) => {
  const { repoName, repoPath } = req.body;
  if (!repoName || !repoPath) {
    return res.status(400).json({ error: 'repoName and repoPath are required.' });
  }

  if (!existsSync(repoPath)) {
    return res.status(400).json({ error: `Repository path does not exist on disk: ${repoPath}` });
  }

  // If already running, don't start a duplicate run
  const current = analysisStatus[repoName];
  if (current && (current.status === 'scanning' || current.status === 'analyzing')) {
    return res.status(200).json({ message: 'Analysis is already in progress.', status: current });
  }

  // Initialize status
  analysisStatus[repoName] = {
    status: 'scanning',
    message: 'Starting analysis...',
    progress: 0,
    timestamp: new Date().toISOString()
  };

  // Run analysis in background
  analyzerService.analyzeRepository(repoPath, repoName, (progressUpdate) => {
    analysisStatus[repoName] = {
      ...analysisStatus[repoName],
      status: progressUpdate.status,
      message: progressUpdate.message,
      progress: progressUpdate.progress || 0,
      timestamp: new Date().toISOString()
    };
  }).then((indexedData) => {
    analysisStatus[repoName].status = 'completed';
    analysisStatus[repoName].message = `Successfully analyzed repository!`;
    analysisStatus[repoName].progress = 100;
  }).catch((err) => {
    console.error(`Analysis failed for ${repoName}:`, err);
    analysisStatus[repoName].status = 'failed';
    analysisStatus[repoName].message = `Analysis failed: ${err.message}`;
  });

  res.status(202).json({
    success: true,
    message: 'Analysis started in the background.',
    status: analysisStatus[repoName]
  });
});

// 3. Poll Analysis Status
router.get('/status/:repoName', (req, res) => {
  const { repoName } = req.params;
  const status = analysisStatus[repoName];
  if (!status) {
    return res.status(404).json({ error: 'No analysis status found for this repository.' });
  }
  res.json(status);
});

// 4. Retrieve list of indexed files
router.get('/files/:repoName', async (req, res) => {
  const { repoName } = req.params;
  try {
    const cache = await analyzerService.getCache(repoName);
    if (!cache.files || Object.keys(cache.files).length === 0) {
      return res.json([]);
    }

    // Map files listing to return only metadata (no large embeddings/chunks)
    const fileList = Object.values(cache.files).map(file => ({
      path: file.path,
      size: file.size,
      chunksCount: file.chunksCount,
      hash: file.hash
    }));
    
    res.json(fileList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Retrieve chunks and metadata for a specific file
router.get('/files/:repoName/chunks', async (req, res) => {
  const { repoName } = req.params;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'Query parameter "path" is required.' });
  }

  try {
    const cache = await analyzerService.getCache(repoName);
    const file = cache.files[filePath];
    
    if (!file) {
      return res.status(404).json({ error: `File "${filePath}" not found in indexed database.` });
    }

    // Return chunks with vector embeddings excluded to save bandwidth
    const chunksWithoutEmbeddings = file.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      metadata: chunk.metadata
    }));

    res.json({
      path: file.path,
      size: file.size,
      hash: file.hash,
      chunks: chunksWithoutEmbeddings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Semantic Vector Search
router.post('/search', async (req, res) => {
  const { repoName, queryText, limit } = req.body;
  if (!repoName || !queryText) {
    return res.status(400).json({ error: 'repoName and queryText are required.' });
  }

  try {
    const results = await analyzerService.semanticSearch(repoName, queryText, limit || 5);
    res.json(results);
  } catch (error) {
    console.error('Semantic Search Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
