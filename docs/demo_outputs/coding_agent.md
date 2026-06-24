# Coding Agent: Demo Output

This file showcases a realistic execution trace and response output for the **Coding Agent**.

---

## 1. Input Context
* **Endpoint**: `POST /api/agent/coding/run`
* **Payload**:
  ```json
  {
    "mode": "generate",
    "prompt": "Write a rate limiter middleware for Express using memory storage. Limit each IP to 100 requests per 15 minutes.",
    "language": "javascript"
  }
  ```

---

## 2. Agent Execution Logs
```
[Coding Agent] INFO: Validating input parameters...
[Coding Agent] INFO: Parameters validated. Mode: generate, Language: javascript
[Coding Agent] INFO: Forwarding request to LLM Gateway...
[LLM Gateway] INFO: Attempting streaming with provider: gemini
[Coding Agent] INFO: Streaming complete. Provider: gemini
```

---

## 3. Raw Response Payload (JSON)
```json
{
  "code": "import rateLimit from 'express-rate-limit';\n\n// Memory-based rate limiter middleware configuration\nconst apiRateLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000, // 15 minutes\n  max: 100, // Limit each IP to 100 requests per window\n  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers\n  legacyHeaders: false, // Disable the `X-RateLimit-*` headers\n  message: {\n    status: 429,\n    error: 'Too many requests. Please try again after 15 minutes.'\n  }\n});\n\nexport default apiRateLimiter;",
  "explanation": "Utilizes express-rate-limit middleware to keep track of connection counts per client IP in memory. It blocks requests exceeding 100 calls in a 15-minute window and replies with an HTTP 429 status.",
  "bestPractices": "Memory storage is not suitable for clustered environments (multi-server deploys). Use a database-backed store like express-rate-limit-redis or a database adapter in production environments."
}
```
