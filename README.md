# opencode-plugin-preload-skills

> Smart skill loading for OpenCode — automatic, contextual, and budget-aware

[![npm version](https://img.shields.io/npm/v/opencode-plugin-preload-skills.svg)](https://www.npmjs.com/package/opencode-plugin-preload-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/juhas96/opencode-plugin-preload-skills?style=social)](https://github.com/juhas96/opencode-plugin-preload-skills)

A powerful plugin for [OpenCode](https://opencode.ai) that intelligently loads skills based on context — file types, directory patterns, agent type, conversation content, and more.

---

## Features

| Feature | Description |
|---------|-------------|
| **Always-On Skills** | Load skills at session start |
| **File-Type Triggers** | Load skills when touching `.py`, `.ts`, etc. |
| **Agent-Specific** | Different skills for different agents |
| **Path Patterns** | Glob patterns like `src/api/**` |
| **Content Triggers** | Keywords in conversation trigger skills |
| **Skill Groups** | Bundle skills together with `@group-name` |
| **Conditional Loading** | Load only if dependency exists |
| **Token Budget** | Cap total skill tokens to protect context |
| **Summaries Mode** | Load compact summaries instead of full content |
| **Usage Analytics** | Track which skills are actually used |

> **⚠️ Warning:** Preloaded skills consume context window tokens. Use `maxTokens` to set a budget and `useSummaries` for large skills.

---

## Quick Start

**1. Add to `opencode.json`:**

```json
{
  "plugin": ["opencode-plugin-preload-skills"]
}
```

**2. Create `.opencode/preload-skills.json`:**

```json
{
  "skills": ["coding-standards"],
  "fileTypeSkills": {
    ".py": ["flask", "python-patterns"],
    ".ts,.tsx": ["typescript-patterns"]
  }
}
```

**3. Create skill files in `.opencode/skills/<name>/SKILL.md`**

---

## Configuration Reference

### All Options

```json
{
  "skills": ["always-loaded-skill"],
  "fileTypeSkills": {
    ".py": ["flask"],
    ".ts,.tsx": ["typescript"]
  },
  "agentSkills": {
    "plan": ["planning-skill"],
    "code": ["coding-skill"]
  },
  "pathPatterns": {
    "src/api/**": ["api-design"],
    "src/components/**": ["react-patterns"]
  },
  "contentTriggers": {
    "database": ["sql-patterns"],
    "authentication": ["auth-security"]
  },
  "groups": {
    "frontend": ["react", "css", "testing"],
    "backend": ["api-design", "database"]
  },
  "conditionalSkills": [
    { "skill": "react", "if": { "packageHasDependency": "react" } },
    { "skill": "prisma", "if": { "fileExists": "prisma/schema.prisma" } }
  ],
  "skillSettings": {
    "large-skill": { "useSummary": true },
    "critical-skill": { "useSummary": false }
  },
  "maxTokens": 10000,
  "useSummaries": false,
  "analytics": false,
  "persistAfterCompaction": true,
  "debug": false
}
```

### Options Table

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `skills` | `string[]` | `[]` | Always load these skills |
| `fileTypeSkills` | `Record<string, string[]>` | `{}` | Map file extensions to skills |
| `agentSkills` | `Record<string, string[]>` | `{}` | Map agent names to skills |
| `pathPatterns` | `Record<string, string[]>` | `{}` | Map glob patterns to skills |
| `contentTriggers` | `Record<string, string[]>` | `{}` | Map keywords to skills |
| `groups` | `Record<string, string[]>` | `{}` | Define skill bundles |
| `conditionalSkills` | `ConditionalSkill[]` | `[]` | Load if condition met |
| `skillSettings` | `Record<string, SkillSettings>` | `{}` | Per-skill settings |
| `maxTokens` | `number` | `undefined` | Max tokens for all skills |
| `useSummaries` | `boolean` | `false` | Use skill summaries (global) |
| `analytics` | `boolean` | `false` | Track skill usage |
| `persistAfterCompaction` | `boolean` | `true` | Keep skills after compaction |
| `debug` | `boolean` | `false` | Enable debug logs |

---

## Feature Details

### File-Type Skills

Load skills when agent touches files with specific extensions:

```json
{
  "fileTypeSkills": {
    ".py": ["flask", "python-best-practices"],
    ".ts,.tsx": ["typescript-advanced-types"],
    ".go": ["golang-patterns"]
  }
}
```

Triggers on: `read`, `edit`, `write`, `glob`, `grep` tools.

### Agent-Specific Skills

Load different skills for different OpenCode agents:

```json
{
  "agentSkills": {
    "plan": ["architecture-planning", "task-breakdown"],
    "code": ["coding-standards", "testing-patterns"],
    "review": ["code-review-checklist"]
  }
}
```

### Path Patterns

Use glob patterns to match file paths:

```json
{
  "pathPatterns": {
    "src/api/**": ["api-design", "rest-patterns"],
    "src/components/**/*.tsx": ["react-component-patterns"],
    "tests/**": ["testing-best-practices"]
  }
}
```

### Content Triggers

Load skills when keywords appear in conversation:

```json
{
  "contentTriggers": {
    "database": ["sql-patterns", "orm-usage"],
    "authentication": ["auth-security", "jwt-patterns"],
    "performance": ["optimization-tips"]
  }
}
```

### Skill Groups

Bundle related skills and reference with `@`:

```json
{
  "groups": {
    "frontend": ["react", "css", "accessibility"],
    "backend": ["api-design", "database", "caching"]
  },
  "skills": ["@frontend"]
}
```

Use `@frontend` anywhere you'd use a skill name.

### Conditional Skills

Load skills only when conditions are met:

```json
{
  "conditionalSkills": [
    {
      "skill": "react-patterns",
      "if": { "packageHasDependency": "react" }
    },
    {
      "skill": "prisma-guide",
      "if": { "fileExists": "prisma/schema.prisma" }
    },
    {
      "skill": "ci-patterns",
      "if": { "envVar": "CI" }
    }
  ]
}
```

**Condition types:**
- `packageHasDependency` — Check package.json dependencies
- `fileExists` — Check if file exists in project
- `envVar` — Check if environment variable is set

### Token Budget

Limit total tokens to protect your context window:

```json
{
  "maxTokens": 8000,
  "skills": ["skill-a", "skill-b", "skill-c"]
}
```

Skills load in order until budget is exhausted. Remaining skills are skipped.

### Skill Summaries

Add a `summary` field to your skill frontmatter for compact loading:

```markdown
---
name: my-skill
description: Full description
summary: Brief one-liner for summary mode
---
```

Enable with:

```json
{
  "useSummaries": true
}
```

If no `summary` field, auto-generates from first paragraph.

### Per-Skill Settings

Override global settings for specific skills:

```json
{
  "useSummaries": false,
  "skillSettings": {
    "large-reference": { "useSummary": true },
    "critical-instructions": { "useSummary": false }
  }
}
```

**Available settings:**
- `useSummary` — Override global `useSummaries` for this skill

**Priority:** `skillSettings` > `useSummaries` (global)

This lets you use full content for critical skills while summarizing large reference materials.

### Usage Analytics

Track which skills are loaded and how often:

```json
{
  "analytics": true
}
```

Saves to `.opencode/preload-skills-analytics.json`.

---

## Skill File Format

```markdown
---
name: skill-name
description: Brief description for logs
summary: Optional one-liner for summary mode
---

# Skill Content

Full instructions here...
```

### Locations (in priority order)

1. `.opencode/skills/<name>/SKILL.md` (project)
2. `.claude/skills/<name>/SKILL.md` (project)
3. `~/.config/opencode/skills/<name>/SKILL.md` (global)
4. `~/.claude/skills/<name>/SKILL.md` (global)

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                     SESSION START                        │
├─────────────────────────────────────────────────────────┤
│  1. Load `skills` + `conditionalSkills` (if met)        │
│  2. Apply token budget if set                           │
│  3. Inject on first message                             │
├─────────────────────────────────────────────────────────┤
│                   DURING SESSION                         │
├─────────────────────────────────────────────────────────┤
│  On file access:                                         │
│    → Check fileTypeSkills (by extension)                │
│    → Check pathPatterns (by glob match)                 │
│                                                          │
│  On message:                                             │
│    → Check agentSkills (by agent name)                  │
│    → Check contentTriggers (by keyword)                 │
│    → Inject any pending skills                          │
├─────────────────────────────────────────────────────────┤
│                    COMPACTION                            │
├─────────────────────────────────────────────────────────┤
│  All loaded skills added to compaction context          │
│  (if persistAfterCompaction: true)                      │
└─────────────────────────────────────────────────────────┘
```

---

## Best Practices

1. **Use `fileTypeSkills` over `skills`** — Only load what's needed
2. **Set `maxTokens`** — Protect your context window
3. **Use `groups`** — Organize related skills
4. **Enable `analytics`** — Find unused skills
5. **Write `summary` fields** — For large skills, enable `useSummaries`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Skills not loading | Check config path, skill file exists, frontmatter valid |
| Wrong skills loading | Check trigger conditions, enable `debug: true` |
| Context too small | Reduce skills, set `maxTokens`, enable `useSummaries` |
| Skills lost after compaction | Ensure `persistAfterCompaction: true` |

---

## License

MIT
