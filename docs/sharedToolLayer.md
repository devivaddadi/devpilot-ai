# Shared Tool Layer Module

The Shared Tool Layer provides a secure, modular, and extensible set of shared utilities for all AI Agents in `devpilot-ai`. It handles path sandboxing, file input/output operations, fenced code block extraction, programming language detection, GitHub markdown formatting, and extensible custom tool hook registration.

---

## Technical Responsibilities

1. **Path Sandbox Enforcement**:
   - Ensures that all read/write file pathways requested by agents lie strictly within the workspace boundaries.
   - Rejects directory traversal attempts (e.g. `../` and absolute paths to system configurations) to prevent unauthorized reads and edits.

2. **Common Utility Actions**:
   - Offers robust wrappers for standard fs operations (`readFile`, `writeFile`, and `exists`).
   - Automatically handles directories creation dynamically when target files are being written.

3. **Code Parsing Utilities**:
   - Extracts multiple fenced code block arrays (`javascript`, `python`, etc.) from raw markdown text dynamically.
   - Detects programming languages based on standard file extension mapping.

4. **Markdown Formatting Generators**:
   - Renders structured data into markdown tables.
   - Renders message alerts using GitHub flavored syntax (`> [!NOTE]`, `> [!WARNING]`, etc.).
   - Renders collapsible details disclosure blocks.

5. **Extensible Custom Tools Registry**:
   - Allows dynamically registering and retrieving executable functions at runtime, isolating execution hooks.

---

## API Reference

### Service functions (`src/services/sharedToolLayer.js`)

#### `resolveSafePath(relPath)`
Resolves and validates a path relative to the workspace directory.
- **Parameters**: `relPath` (string)
- **Returns**: Absolute resolved path string.
- **Throws**: Error if path attempts to traverse out of workspace bounds.

#### `fileOps.readFile(relPath)`
Safely reads file contents.
- **Parameters**: `relPath` (string)
- **Returns**: Promise resolving to file contents.

#### `fileOps.writeFile(relPath, content)`
Safely writes file contents, recursively creating folders if missing.
- **Parameters**: `relPath` (string), `content` (string)
- **Returns**: Promise resolving to `true`.

#### `fileOps.exists(relPath)`
Returns boolean indicating if safe path exists on disk.

#### `parser.extractCodeBlocks(mdText)`
Parses fenced markdown code blocks.
- **Parameters**: `mdText` (string)
- **Returns**: `Array<{language: string, content: string}>`

#### `parser.detectLanguage(filePath)`
Determines programming language.
- **Parameters**: `filePath` (string)
- **Returns**: Language identifier matching extension.

#### `markdown.generateTable(headers, rows)`
- **Parameters**: `headers` (Array<string>), `rows` (Array<Array<string>>)
- **Returns**: String of markdown table syntax.

#### `markdown.generateAlert(type, message)`
- **Parameters**: `type` ('NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'), `message` (string)
- **Returns**: String of Github flavored alert blocks.

#### `markdown.generateCollapsible(summary, content)`
- **Parameters**: `summary` (string), `content` (string)
- **Returns**: String of details disclosure markup block.

#### `registerTool(name, fn)` / `getTool(name)`
Registers and retrieves helper executable functions.

---

## REST API Endpoints

### 1. `POST /api/shared-tools/parse-code`
Parse and extract code blocks from raw markdown payload.
- **Payload**:
  ```json
  {
    "markdown": "Here is code:\n```js\nconsole.log(42);\n```"
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "blocks": [
      {
        "language": "js",
        "content": "console.log(42);\n"
      }
    ]
  }
  ```

### 2. `POST /api/shared-tools/format-markdown`
Format objects into markdown elements.
- **Alert Payload**:
  ```json
  {
    "formatType": "alert",
    "type": "WARNING",
    "message": "Out of memory error."
  }
  ```
- **Table Payload**:
  ```json
  {
    "formatType": "table",
    "headers": ["User", "Privileges"],
    "rows": [
      ["admin", "root"],
      ["developer", "write"]
    ]
  }
  ```
- **Collapsible Payload**:
  ```json
  {
    "formatType": "collapsible",
    "summary": "Expand Logs",
    "content": "Stack overflow at line 23."
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "formatted": "...Markdown content here..."
  }
  ```
