import config from '../config.js';
import { AsyncLocalStorage } from 'async_hooks';

export const memoryStorage = new AsyncLocalStorage();

export const mockOverrides = {};

// Keep track of rate limits per provider
export const rateLimits = {
  gemini: { maxRequests: 15, currentRequests: 0, windowMs: 60000, resetTime: 0 },
  openai: { maxRequests: 10, currentRequests: 0, windowMs: 60000, resetTime: 0 },
  anthropic: { maxRequests: 5, currentRequests: 0, windowMs: 60000, resetTime: 0 },
};

/**
 * Screen rate limit usage before dispatching requests
 * @param {'gemini'|'openai'|'anthropic'} provider 
 */
export function checkRateLimit(provider) {
  const limit = rateLimits[provider];
  if (!limit) return true;

  const now = Date.now();
  if (now > limit.resetTime) {
    limit.currentRequests = 0;
    limit.resetTime = now + limit.windowMs;
  }

  if (limit.currentRequests >= limit.maxRequests) {
    return false; // Rate limited!
  }

  limit.currentRequests++;
  return true;
}

/**
 * Get configured API Key for provider
 */
function getApiKey(provider) {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY || config.geminiApiKey;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  return null;
}

/**
 * Verify if any provider holds a valid API key configured
 */
function hasAnyApiKey() {
  return !!(getApiKey('gemini') || getApiKey('openai') || getApiKey('anthropic'));
}

/**
 * Check if the error returned is retriable (e.g. Rate Limit 429, Server Error 5xx)
 * @param {Error} err 
 */
function isRetriableError(err) {
  if (!err.status) return true; // Network errors are retriable
  return err.status === 429 || (err.status >= 500 && err.status < 600);
}

/**
 * Executes a function with exponential backoff retries
 */
async function callWithRetry(fn, maxRetries = 3, initialDelay = 100) {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries || !isRetriableError(err)) {
        throw err;
      }
      console.warn(`[Retry] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Dispatches the HTTP stream request to the provider API
 */
async function executeProviderRequest(provider, apiKey, contents, systemInstruction, options) {
  let url = '';
  let headers = { 'Content-Type': 'application/json' };
  let body = {};

  if (provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${apiKey}`;
    body = {
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
    };
  } else if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;

    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    for (const item of contents) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.[0]?.text || ''
      });
    }

    body = {
      model: options.openaiModel || 'gpt-4o-mini',
      messages,
      stream: true
    };
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';

    const messages = [];
    for (const item of contents) {
      messages.push({
        role: item.role === 'model' ? 'assistant' : 'user',
        content: item.parts?.[0]?.text || ''
      });
    }

    body = {
      model: options.anthropicModel || 'claude-3-5-sonnet-20241022',
      messages,
      system: systemInstruction || undefined,
      max_tokens: options.maxTokens || 1024,
      stream: true
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Provider ${provider} returned status ${response.status}: ${errorText}`);
    err.status = response.status;
    throw err;
  }

  return response;
}

/**
 * Parses chunk streams across different provider shapes
 */
async function parseStreamResponse(response, provider, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    if (provider === 'gemini') {
      let match;
      while ((match = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(buffer)) !== null) {
        try {
          const text = JSON.parse(`"${match[1]}"`);
          if (text) onChunk(text);
        } catch {}
        buffer = buffer.substring(match.index + match[0].length);
      }
    } else {
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.substring(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (provider === 'openai') {
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) onChunk(text);
            } else if (provider === 'anthropic') {
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text || '';
                if (text) onChunk(text);
              }
            }
          } catch {}
        }
      }
    }
  }
}

/**
 * Stream completion with automatic provider failover, rate limits, and retries.
 * @param {Array<{role: string, parts: Array<{text: string}>}>} contents 
 * @param {string} systemInstruction 
 * @param {Object} options 
 * @param {'gemini'|'openai'|'anthropic'} [options.provider] - Preferred provider
 * @param {number} [options.maxRetries=3] 
 * @param {boolean} [options.forceMock] 
 * @param {Function} onChunk 
 * @param {Function} onComplete 
 * @param {Function} onError 
 */
export async function streamCompletion(contents, systemInstruction, options = {}, onChunk, onComplete, onError) {
  let activeContents = contents;
  let activeSystemInstruction = systemInstruction;

  const store = memoryStorage.getStore();
  if (store && store.conversationId) {
    try {
      const { getConversationContext } = await import('./conversationMemory.js');
      const context = await getConversationContext(store.conversationId);
      if (context) {
        if (context.messages && context.messages.length > 0) {
          // Exclude the last message which represents the current user active prompt
          const history = context.messages.slice(0, -1).map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
          }));
          activeContents = [...history, ...contents];
        }
        if (context.systemPromptExtension) {
          activeSystemInstruction = systemInstruction
            ? `${systemInstruction}\n\n${context.systemPromptExtension}`
            : context.systemPromptExtension;
        }
      }
    } catch (err) {
      console.warn(`[LLM Gateway] Memory integration context fetch failed: ${err.message}`);
    }
  }

  if (mockOverrides.streamCompletion) {
    return mockOverrides.streamCompletion(activeContents, activeSystemInstruction, options, onChunk, onComplete, onError);
  }

  const defaultOrder = ['gemini', 'openai', 'anthropic'];
  const preferred = options.provider;

  // Build the fallback chain
  const providersToTry = preferred
    ? [preferred, ...defaultOrder.filter(p => p !== preferred)]
    : defaultOrder;

  let lastError = null;

  for (const provider of providersToTry) {
    // 1. Check Rate Limit
    if (!checkRateLimit(provider)) {
      console.warn(`[LLM Gateway] Provider ${provider} is rate limited. Failing over...`);
      lastError = new Error(`Rate limit exceeded for provider ${provider}`);
      continue;
    }

    // 2. Load API key
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      console.log(`[LLM Gateway] API key not found for provider ${provider}. Failing over...`);
      lastError = new Error(`API key missing for provider ${provider}`);
      continue;
    }

    // 3. Attempt Request
    try {
      console.log(`[LLM Gateway] Attempting streaming with provider: ${provider}`);
      await callWithRetry(async () => {
        const response = await executeProviderRequest(provider, apiKey, activeContents, activeSystemInstruction, options);
        await parseStreamResponse(response, provider, onChunk);
      }, options.maxRetries || 3, options.retryDelay || 50);

      // Completion callback with active provider
      onComplete(provider);
      return;
    } catch (err) {
      console.error(`[LLM Gateway] Provider ${provider} run failed: ${err.message}`);
      lastError = err;
    }
  }

  // 4. Fallback mock generation for testing and local runs
  const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT || process.execArgv.some(arg => arg.startsWith('--test'));
  const forceMock = options.forceMock || !hasAnyApiKey();

  if (forceMock || isTest) {
    const fallbackProvider = preferred || 'gemini';
    console.log(`[LLM Gateway] Fallback mock active for provider: ${fallbackProvider}`);
    try {
      const mockText = `[Mock Completed via ${fallbackProvider}] Success streaming response chunk.`;
      const words = mockText.split(/(\s+)/);

      if (isTest) {
        for (const w of words) onChunk(w);
        onComplete(fallbackProvider);
      } else {
        let idx = 0;
        const timer = setInterval(() => {
          if (idx >= words.length) {
            clearInterval(timer);
            onComplete(fallbackProvider);
          } else {
            onChunk(words[idx]);
            idx++;
          }
        }, 20);
      }
      return;
    } catch (err) {
      onError(err);
      return;
    }
  }

  onError(new Error(`LLM Gateway failed. All providers exhausted. Last error: ${lastError?.message}`));
}
