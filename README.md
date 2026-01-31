# opencode-plugin-preload-skills

> Automatically load skills into agent memory at session start

[![npm version](https://img.shields.io/npm/v/opencode-plugin-preload-skills.svg)](https://www.npmjs.com/package/opencode-plugin-preload-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A plugin for [OpenCode](https://opencode.ai) that preloads specified skills into the agent's context automatically when a session starts. Skills persist across context compaction, ensuring your agent always has access to the knowledge it needs.

---

## Features

- **Automatic Loading** — Skills are injected on the first message of each session
- **Compaction Persistence** — Skills survive context compaction and remain available
- **Multiple Skill Sources** — Searches project and global skill directories
- **Debug Logging** — Optional verbose logging for troubleshooting
- **Zero Runtime Overhead** — Skills loaded once per session

---

## Installation

```bash
npm install opencode-plugin-preload-skills
```

---

## Quick Start

**1. Add the plugin to your `opencode.json`:**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-plugin-preload-skills"],
  "opencode-plugin-preload-skills": {
    "skills": ["my-coding-standards", "project-architecture"]
  }
}
```

**2. Create a skill file:**

```
.opencode/skills/my-coding-standards/SKILL.md
```

```markdown
---
name: my-coding-standards
description: Coding standards and conventions for this project
---

## Code Style

- Use 2 spaces for indentation
- Prefer `const` over `let`
- Use TypeScript strict mode
...
```

**3. Start OpenCode** — your skills are automatically loaded!

---

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skills` | `string[]` | `[]` | Skill names to auto-load |
| `persistAfterCompaction` | `boolean` | `true` | Re-inject skills after context compaction |
| `debug` | `boolean` | `false` | Enable debug logging |

### Full Example

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-plugin-preload-skills"],
  "opencode-plugin-preload-skills": {
    "skills": [
      "coding-standards",
      "api-patterns",
      "testing-guide"
    ],
    "persistAfterCompaction": true,
    "debug": false
  }
}
```

---

## Skill Locations

The plugin searches for skills in the following locations (in order):

| Priority | Path | Scope |
|----------|------|-------|
| 1 | `.opencode/skills/<name>/SKILL.md` | Project |
| 2 | `.claude/skills/<name>/SKILL.md` | Project (Claude-compatible) |
| 3 | `~/.config/opencode/skills/<name>/SKILL.md` | Global |
| 4 | `~/.claude/skills/<name>/SKILL.md` | Global (Claude-compatible) |

The first matching skill file is used.

---

## Skill File Format

Skills use markdown with YAML frontmatter:

```markdown
---
name: skill-name
description: Brief description shown in logs
---

# Skill Content

Your skill instructions here. This entire content
is injected into the agent's context.

## Sections

Organize with headers, code blocks, lists, etc.
```

### Required Fields

- `name` — Must match the directory name (lowercase, hyphen-separated)
- `description` — Brief description for logging

---

## How It Works

```
Session Start
     │
     ▼
┌─────────────────────┐
│  Plugin loads       │
│  configured skills  │
│  from disk          │
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  First message      │──▶ Skills injected as synthetic content
│  in session         │
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  Context            │──▶ Skills added to compaction context
│  compaction         │    (if persistAfterCompaction: true)
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  Session            │──▶ Cleanup session tracking
│  deleted            │
└─────────────────────┘
```

---

## Troubleshooting

### Skills not loading?

1. **Check the skill path** — Ensure `SKILL.md` exists in the correct directory
2. **Verify frontmatter** — Both `name` and `description` are required
3. **Enable debug mode** — Set `"debug": true` in config
4. **Check logs** — Look for `preload-skills` service messages

### Skills lost after compaction?

Ensure `persistAfterCompaction` is `true` (this is the default).

---

## License

MIT
