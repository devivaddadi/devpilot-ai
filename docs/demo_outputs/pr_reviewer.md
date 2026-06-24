# PR Reviewer Agent: Demo Output

This file showcases a realistic execution trace and response output for the **PR Reviewer Agent**.

---

## 1. Input Context
* **Endpoint**: `POST /api/agent/pull-request-review/run`
* **Payload**:
  ```json
  {
    "mode": "detect_bugs",
    "prompt": "Scan the order processing changes for possible race conditions or parameter validation gaps.",
    "diff": "--- a/src/routes/orders.js\n+++ b/src/routes/orders.js\n@@ -12,4 +12,6 @@\n router.post('/checkout', async (req, res) => {\n   const { items } = req.body;\n-  await processCheckout(items);\n+  const result = await processCheckout(items);\n+  res.status(200).json(result);\n });"
  }
  ```

---

## 2. Agent Execution Logs
```
[PR Reviewer Agent] INFO: Validating input parameters...
[PR Reviewer Agent] INFO: Parameters validated. Mode: detect_bugs
[PR Reviewer Agent] INFO: Forwarding request to LLM Gateway...
[LLM Gateway] INFO: Attempting streaming with provider: gemini
[PR Reviewer Agent] INFO: Streaming complete. Provider: gemini
```

---

## 3. Raw Response Payload (JSON)
```json
{
  "reviews": [
    {
      "filePath": "src/routes/orders.js",
      "line": 13,
      "comment": "Security Risk: The destructured parameter 'items' is directly forwarded to 'processCheckout' without schema validation. If 'items' is undefined or not an array, it may cause an unhandled exception crash. Recommend adding Array.isArray(items) verification before processing."
    }
  ],
  "summary": "Detected 1 critical input verification gap in orders route controller changes."
}
```
