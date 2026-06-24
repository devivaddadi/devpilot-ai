# Prompt Optimizer Agent

The **Prompt Optimizer Agent** is a dedicated service within `devpilot-ai` designed to refine, structure, and optimize raw developer prompts. It transforms rough ideas, vague requests, or simple queries into highly-effective prompts tailored for Large Language Models (LLMs) executing coding, documentation, and debugging tasks.

---

## Key Responsibilities

1. **Rewrite Prompts**: Convert simple prompts into comprehensive instructions structured with context, role definitions, and output expectations.
2. **Improve Clarity**: Reorganize instructions, simplify grammar, and split prompts into logical execution steps or lists.
3. **Reduce Ambiguity**: Identify vague requirements, assumptions, or missing guardrails and replace them with explicit constraints and boundaries.
4. **Optimize for Coding Tasks**: Inject code generation constraints such as language-specific specs, design principles, modularity guidelines, naming conventions, and lint compliance.
5. **Optimize for Documentation**: Structure prompts to mandate specific technical writing standards, markdown headers, API tables, schemas, or developer setup tutorials.
6. **Optimize for Debugging**: Instruct LLMs on how to analyze exceptions, traces, and crash dumps step-by-step to identify root causes and generate clean diff patches.

---

## API Specifications

### Route Mount Point
* **Base URL**: `/api/agent/prompt-optimizer`

### `POST /run`
Runs the Prompt Optimizer Agent on the user prompt and streams back the rewritten version.

#### Headers
* `Content-Type: application/json`

#### Request Body
```json
{
  "mode": "optimize_coding",
  "prompt": "write a node function that fetches weather from an api"
}
```

* **`mode`** (String, Required): One of:
  * `rewrite`
  * `improve_clarity`
  * `reduce_ambiguity`
  * `optimize_coding`
  * `optimize_documentation`
  * `optimize_debugging`
* **`prompt`** (String, Required): The raw prompt/instruction that you want optimized.

#### Response Formats

##### 1. Success Event Stream (SSE)
* **Status**: `200 OK`
* **Content-Type**: `text/event-stream`
* **Streams**:
  * Chunks of the LLM JSON response:
    ```event-stream
    data: {"chunk":"{\n  \"optimizedPrompt\": \"You are a senior Node.js developer...\""}
    ```
  * Completed metadata followed by the custom SSE `[DONE]` signal:
    ```event-stream
    data: {"status":"completed","provider":"gemini"}

    data: [DONE]
    ```

##### 2. Error Response
If inputs are invalid or validation fails immediately before connection starts, returns JSON error:
* **Status**: `500 Internal Server Error` (or `400 Bad Request`)
* **Content-Type**: `application/json`
```json
{
  "error": "Prompt is required."
}
```

---

## Under the Hood

### Prompt Templates
The agent structures prompt templates ensuring the downstream model replies in a deterministic, parsable JSON structure:

```json
{
  "optimizedPrompt": "REWRITTEN_PROMPT_HERE",
  "explanation": "WHY_AND_WHAT_WAS_CHANGED"
}
```

This structured response ensures integrating clients can safely parse and extract the newly enhanced prompt.

### Logging and Telemetry
Operations are logged to standard output using the agent's internal logger:
* `[Prompt Optimizer Agent] INFO`: Tracks request parameters validation, payload processing, and model gateways dispatching.
* `[Prompt Optimizer Agent] WARN`: Logs warning events such as rate limits or provider failovers.
* `[Prompt Optimizer Agent] ERROR`: Details runtime crashes and stack traces.
