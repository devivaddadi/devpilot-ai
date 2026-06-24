# Terminal Assistant Agent

The **Terminal Assistant Agent** is a dedicated service within `devpilot-ai` designed to help developers formulate, explain, debug, and understand command line scripts. It suggests correct parameters, guides users through Git workflows, provides Docker assistance, and diagnoses shell execution errors while strictly adhering to safety policies (never executing terminal commands directly on the user's host machine).

---

## Capabilities & Modes

The agent supports six operation modes:

1. **`explain_command`**: Explains a given terminal command statement, detailing flags, parameters, and safety concerns.
2. **`suggest_command`**: Suggests one or more shell commands to accomplish the user's objective (e.g. searching text, listing files).
3. **`explain_error`**: Takes error logs or crash stack messages from shell outputs, identifies the cause, and outlines resolution steps.
4. **`generate_command`**: Generates shell commands or bash/PowerShell scripts to run specific tasks.
5. **`assist_git`**: Guides users through Git version control operations, rebasing procedures, stash recoveries, or merge conflict resolutions.
6. **`assist_docker`**: Recommends container setups, compose yaml files, Dockerfiles declarations, network binds, or container inspection scripts.

---

## API Reference

### Endpoint
* **URI**: `POST /api/agent/terminal-assistant/run`
* **Format**: Server-Sent Events (`text/event-stream`)

### Payload Example
```json
{
  "mode": "generate_command",
  "prompt": "Find all log files in a directory that were modified in the last 24 hours."
}
```

* **`mode`** (String, Required): One of:
  * `explain_command`
  * `suggest_command`
  * `explain_error`
  * `generate_command`
  * `assist_git`
  * `assist_docker`
* **`prompt`** (String, Required): The command query, error details, or goal description.

---

## Target Output Formats

All modes respond with a JSON stream, chunk by chunk, completing with the following keys.

### Explain Command Mode
```json
{
  "explanation": "Detailed markdown explanation of the command options...",
  "summary": "Describes command in one sentence."
}
```

### Suggest / Assist Modes
(`suggest_command`, `assist_git`, `assist_docker`)
```json
{
  "suggestedCommands": [
    {
      "command": "git stash list",
      "explanation": "List all active stashes in your local repository."
    }
  ],
  "explanation": "Detailed step-by-step description of workflows...",
  "summary": "Short overview summary."
}
```

### Generate Command Mode
```json
{
  "command": "find . -name '*.log' -mtime -1",
  "explanation": "Explanation of flags (-name matching name, -mtime -1 matching modified within 24 hours)...",
  "summary": "Generates find logs script."
}
```

---

## Platform-Tailored Generation

Although the agent **never executes commands**, it securely calls `tools.getSystemInfo()` to query the host OS platform (`win32`, `darwin`, `linux`) and active shell environment (`powershell`, `cmd`, `bash`, `zsh`). This lets it tailor the syntax of the generated script specifically to the developer's workstation configuration.
