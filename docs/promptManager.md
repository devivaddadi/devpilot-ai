# Prompt Manager Module

The **Prompt Manager** module is a core administrative service within `devpilot-ai` designed to register, version, organize, and render reusable prompt templates. It isolates prompt configurations to dynamic files and parses double curly brace variables substitutions, ensuring that other agent modules can fetch version-pinned prompt systems easily.

---

## Storage Structure

Prompts are serialized inside the workspace cache at `.devpilot-cache/prompts.json` using the following schema mapping:

```json
{
  "sqlFormatter": {
    "name": "sqlFormatter",
    "activeVersion": "1.1.0",
    "versions": {
      "1.0.0": {
        "version": "1.0.0",
        "template": "Format this query: {{sql}}",
        "description": "Initial format release",
        "createdAt": "2026-06-24T12:00:00Z"
      },
      "1.1.0": {
        "version": "1.1.0",
        "template": "Format this query and explain index optimization: {{sql}}",
        "description": "Add index analysis support",
        "createdAt": "2026-06-24T12:30:00Z"
      }
    }
  }
}
```

---

## Prompt Template Replacements

Templates support mustache-style parameter insertions. Any placeholder written as `{{ placeholderKey }}` is dynamically replaced using regex matching when calling the render tool. Whitespace padding inside brackets is automatically trimmed:

```javascript
// Template: "Greet user {{ name }} and explain task {{ taskName }}"
// Variables: { name: "John", taskName: "refactoring" }
// Rendered Result: "Greet user John and explain task refactoring"
```

---

## API Specifications

### Base Mount Route
* `/api/prompt-manager`

### 1. `GET /`
Lists all registered prompt configurations catalogued in storage.

### 2. `POST /store`
Saves or versions a new prompt template.
* **Request Body**:
  ```json
  {
    "name": "codeReviewer",
    "template": "Review the following changes:\n{{diff}}",
    "version": "1.0.0",
    "description": "Standard code reviewer prompt"
  }
  ```
* **Response**:
  ```json
  {
    "status": "success",
    "prompt": {
      "name": "codeReviewer",
      "activeVersion": "1.0.0",
      "versions": { ... }
    }
  }
  ```

### 3. `POST /render`
Compiles and returns a rendered prompt string using variables values.
* **Request Body**:
  ```json
  {
    "name": "codeReviewer",
    "variables": {
      "diff": "@@ -1,3 +1,4 @@\n+const a = 1;"
    },
    "version": "1.0.0"
  }
  ```
* **Response**:
  ```json
  {
    "status": "success",
    "rendered": "Review the following changes:\n@@ -1,3 +1,4 @@\n+const a = 1;"
  }
  ```

### 4. `GET /:name`
Retrieves a prompt definition by name. Accepts optional query parameter `v` (version).
* **URI**: `/api/prompt-manager/codeReviewer?v=1.0.0`
* **Response**:
  ```json
  {
    "name": "codeReviewer",
    "version": "1.0.0",
    "template": "Review the following changes:\n{{diff}}",
    "description": "Standard code reviewer prompt"
  }
  ```
