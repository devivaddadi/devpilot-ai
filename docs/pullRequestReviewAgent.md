# Pull Request Review Agent

The **Pull Request Review Agent** is a dedicated service within `devpilot-ai` designed to automate and assist in code reviews. It is responsible for reviewing diff files, catching potential runtime bugs, outlining structural design or standards violations, explaining reviewer comments, and outputting general approval summary decisions.

---

## Capabilities

The agent operates across six distinct review modes:

1. **`review_changed_files`**: Performs a general inspection of modifications inside changed files or diff text.
2. **`detect_bugs`**: Investigates the diff payload for concurrency mistakes, edge cases, potential memory leaks, logic bugs, or unhandled promise rejections.
3. **`suggest_improvements`**: Recommends refactoring ideas, performance optimizations, modular code breakdowns, or clean coding improvements.
4. **`review_coding_standards`**: Inspects code formatting, naming guidelines, encapsulation compliance, and general security rules.
5. **`explain_review_comments`**: Provides a descriptive explanation/context matching historical review comments with corresponding code statements for instruction/clarification.
6. **`produce_review_summary`**: Aggregates all feedback, classifies risk parameters, and returns a summary approval judgment (Approve, Request Changes, Comment).

---

## API References

### Endpoint
* **URI**: `POST /api/agent/pull-request-review/run`
* **Format**: Server-Sent Events (`text/event-stream`)

### Payload Example
```json
{
  "mode": "detect_bugs",
  "prompt": "Inspect this diff for race conditions and return feedback.",
  "diffContent": "@@ -1,5 +1,6 @@\n+async function load() {\n+  await fetch();\n+}"
}
```

* **`mode`** (String, Required): One of:
  * `review_changed_files`
  * `detect_bugs`
  * `suggest_improvements`
  * `review_coding_standards`
  * `explain_review_comments`
  * `produce_review_summary`
* **`prompt`** (String, Required): Instructions detailing custom coding rules, context details, or specific files.
* **`diffContent`** (String, Optional): Git diff patch formatting string. If omitted, the agent uses the local workspace diff (`git diff HEAD`).
* **`comments`** (String, Optional): Previous review comments to explain (only used in `explain_review_comments` mode).
* **`reviewsList`** (String, Optional): Summary reviews feedback (only used in `produce_review_summary` mode).

---

## Target Output Formats

Depending on the mode, the downstream models return one of the following JSON structures.

### Standard Review Modes
(`review_changed_files`, `detect_bugs`, `suggest_improvements`, `review_coding_standards`)

```json
{
  "reviews": [
    {
      "filePath": "src/services/db.js",
      "line": 15,
      "comment": "Connection is opened but never closed in early return branch."
    }
  ],
  "summary": "Detected 1 critical resource leak issue in db.js."
}
```

### Explanatory Comments Mode
(`explain_review_comments`)

```json
{
  "explanation": "Detailed step-by-step reasoning explaining why the line raises issues and suggestions for fixing it.",
  "summary": "Brief summary of explained topics."
}
```

### Executive Summary Mode
(`produce_review_summary`)

```json
{
  "summary": "Refactored db initialization sequence and routes loading configuration.",
  "riskLevel": "Medium",
  "decision": "Request Changes",
  "explanation": "Requesting changes to address the resource leak identified in db.js."
}
```
