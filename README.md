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

> **⚠️ Warning:** Preloaded skills consume context window tokens on every session. Large skills or many skills can significantly reduce available context for your conversation. Keep skills concise and only preload what's truly needed for every session.

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
  "plugin": ["opencode-plugin-preload-skills"]
}
```

**2. Create the plugin config file `.opencode/preload-skills.json`:**

```json
{
  "skills": ["my-coding-standards", "project-architecture"]
}
```

**3. Create a skill file:**

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

**4. Start OpenCode** — your skills are automatically loaded!

---

## Configuration

Create `preload-skills.json` in one of these locations:

| Priority | Path | Scope |
|----------|------|-------|
| 1 | `.opencode/preload-skills.json` | Project |
| 2 | `./preload-skills.json` | Project root |
| 3 | `~/.config/opencode/preload-skills.json` | Global |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skills` | `string[]` | `[]` | Skill names to auto-load |
| `persistAfterCompaction` | `boolean` | `true` | Re-inject skills after context compaction |
| `debug` | `boolean` | `false` | Enable debug logging |

### Full Example

```json
{
  "skills": [
    "coding-standards",
    "api-patterns",
    "testing-guide"
  ],
  "persistAfterCompaction": true,
  "debug": false
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

## Best Practices

- **Keep skills concise** — Every token counts against your context window
- **Preload sparingly** — Only include skills needed for *every* session
- **Use on-demand loading** — For situational skills, use OpenCode's native `skill` tool instead
- **Monitor token usage** — Large skills can reduce conversation capacity by thousands of tokens

---

## Troubleshooting

### Skills not loading?

1. **Check the config file** — Ensure `.opencode/preload-skills.json` exists
2. **Check the skill path** — Ensure `SKILL.md` exists in the correct directory
3. **Verify frontmatter** — Both `name` and `description` are required
4. **Enable debug mode** — Set `"debug": true` in config
5. **Check logs** — Look for `preload-skills` service messages

### Skills lost after compaction?

Ensure `persistAfterCompaction` is `true` (this is the default).

### Context window running out quickly?

You may have too many or too large skills preloaded. Consider:
- Reducing the number of preloaded skills
- Trimming skill content to essentials
- Moving less critical skills to on-demand loading

---

## License

MIT
