# Documentation Agent: Demo Output

This file showcases a realistic execution trace and response output for the **Documentation Agent**.

---

## 1. Input Context
* **Endpoint**: `POST /api/agent/documentation/run`
* **Payload**:
  ```json
  {
    "mode": "markdown",
    "prompt": "Create a detailed README configuration block detailing how to configure JWT signature verification in our app.",
    "language": "markdown"
  }
  ```

---

## 2. Agent Execution Logs
```
[Documentation Agent] INFO: Validating input parameters...
[Documentation Agent] INFO: Parameters validated. Mode: markdown
[Documentation Agent] INFO: Forwarding request to LLM Gateway...
[LLM Gateway] INFO: Attempting streaming with provider: gemini
[Documentation Agent] INFO: Streaming complete. Provider: gemini
```

---

## 3. Raw Response Payload (JSON)
```json
{
  "content": "### JWT Configuration Guide\n\nTo configure JSON Web Token verification, add the following variables to your local `.env` file:\n\n```env\nJWT_SECRET=your_super_secret_signing_key_here\nJWT_EXPIRY=24h\n```\n\n#### Usage Example\n\n```javascript\nimport jwt from 'jsonwebtoken';\nimport config from './config.js';\n\nexport function verifyToken(token) {\n  return jwt.verify(token, config.jwtSecret);\n}\n```",
  "summary": "JWT environmental variable settings guidelines and verification coding examples."
}
```
