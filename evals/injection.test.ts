import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { loadSkill, formatSkillsForInjection } from "../src/skills/loader.js"

describe("Injection Verification", () => {
  const testDir = join(process.cwd(), ".test-injection")
  const skillsDir = join(testDir, ".opencode", "skills")

  beforeEach(() => {
    mkdirSync(skillsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  const createSkill = (name: string, content: string) => {
    const skillDir = join(skillsDir, name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), content)
  }

  describe("Skill Content Preservation", () => {
    it("preserves critical instructions in full mode", () => {
      createSkill(
        "critical-patterns",
        `---
name: critical-patterns
description: Must-follow patterns
summary: Short summary
---

# Critical Rules

MANDATORY: Always use async/await
FORBIDDEN: Never use .then() chains
ALWAYS: Include error handling`
      )

      const skill = loadSkill("critical-patterns", testDir)
      const formatted = formatSkillsForInjection([skill!])

      expect(formatted).toContain("MANDATORY")
      expect(formatted).toContain("FORBIDDEN")
      expect(formatted).toContain("ALWAYS")
      expect(formatted).toContain("async/await")
      expect(formatted).toContain(".then()")
    })

    it("preserves code examples in full mode", () => {
      const codeExample = `\`\`\`typescript
async function fetchData(): Promise<Data> {
  const response = await fetch(url)
  return response.json()
}
\`\`\``

      createSkill(
        "code-skill",
        `---
name: code-skill
description: Code patterns
---

${codeExample}`
      )

      const skill = loadSkill("code-skill", testDir)
      const formatted = formatSkillsForInjection([skill!])

      expect(formatted).toContain("async function fetchData")
      expect(formatted).toContain("await fetch")
      expect(formatted).toContain("Promise<Data>")
    })

    it("summary mode loses detail but keeps essence", () => {
      createSkill(
        "detailed-skill",
        `---
name: detailed-skill
description: Detailed instructions
summary: Use async/await, no .then(), always try/catch
---

# Full Content

This is very detailed content that explains everything in depth.
Including examples and edge cases that are important.`
      )

      const skill = loadSkill("detailed-skill", testDir)!

      const full = formatSkillsForInjection([skill], { useSummaries: false })
      const summary = formatSkillsForInjection([skill], { useSummaries: true })

      expect(full.length).toBeGreaterThan(summary.length)
      expect(summary).toContain("async/await")
      expect(summary).not.toContain("Full Content")
    })

    it("minification preserves instructions while reducing size", () => {
      createSkill(
        "verbose-skill",
        `---
name: verbose-skill
description: Test
---

# Title

<!-- This is a comment that should be removed -->

MANDATORY: Follow    these    rules


With extra    spacing   that should   collapse`
      )

      const skill = loadSkill("verbose-skill", testDir)!

      const original = formatSkillsForInjection([skill], { useMinification: false })
      const minified = formatSkillsForInjection([skill], { useMinification: true })

      expect(minified.length).toBeLessThan(original.length)
      expect(minified).toContain("MANDATORY")
      expect(minified).not.toContain("<!-- This is a comment")
      expect(minified).not.toContain("    ")
    })
  })

  describe("Injection Format", () => {
    it("wraps skills in XML-like tags", () => {
      createSkill("tagged-skill", "---\nname: tagged-skill\n---\nContent")

      const skill = loadSkill("tagged-skill", testDir)!
      const formatted = formatSkillsForInjection([skill])

      expect(formatted).toContain("<preloaded-skills>")
      expect(formatted).toContain("</preloaded-skills>")
      expect(formatted).toContain('name="tagged-skill"')
    })

    it("formats multiple skills correctly", () => {
      createSkill("skill-a", "---\nname: skill-a\n---\nContent A")
      createSkill("skill-b", "---\nname: skill-b\n---\nContent B")

      const skillA = loadSkill("skill-a", testDir)!
      const skillB = loadSkill("skill-b", testDir)!
      const formatted = formatSkillsForInjection([skillA, skillB])

      expect(formatted).toContain('name="skill-a"')
      expect(formatted).toContain('name="skill-b"')
      expect(formatted).toContain("Content A")
      expect(formatted).toContain("Content B")
    })

    it("includes skill description in tag", () => {
      createSkill(
        "described-skill",
        "---\nname: described-skill\ndescription: Important coding rules\n---\nContent"
      )

      const skill = loadSkill("described-skill", testDir)!
      const formatted = formatSkillsForInjection([skill])

      expect(formatted).toContain("Important coding rules")
    })
  })

  describe("Edge Cases", () => {
    it("handles skill with only frontmatter", () => {
      createSkill("minimal", "---\nname: minimal\ndescription: test\n---\n")

      const skill = loadSkill("minimal", testDir)!
      const formatted = formatSkillsForInjection([skill])

      expect(formatted).toContain('name="minimal"')
    })

    it("handles skill with special characters", () => {
      createSkill(
        "special-chars",
        `---
name: special-chars
---

Use \`backticks\` and "quotes" and 'apostrophes'
Also <angle> & ampersand`
      )

      const skill = loadSkill("special-chars", testDir)!
      const formatted = formatSkillsForInjection([skill])

      expect(formatted).toContain("`backticks`")
      expect(formatted).toContain('"quotes"')
      expect(formatted).toContain("<angle>")
    })

    it("handles large skills", () => {
      const largeContent = "A".repeat(50000)
      createSkill("large-skill", `---\nname: large-skill\n---\n${largeContent}`)

      const skill = loadSkill("large-skill", testDir)!
      const formatted = formatSkillsForInjection([skill])

      expect(formatted).toContain('name="large-skill"')
      expect(formatted.length).toBeGreaterThan(50000)
    })

    it("returns empty string for empty skills array", () => {
      const formatted = formatSkillsForInjection([])
      expect(formatted).toBe("")
    })
  })

  describe("Token Budget Impact", () => {
    it("full mode uses more tokens than summary mode", () => {
      createSkill(
        "token-test",
        `---
name: token-test
description: Test
summary: Brief summary
---

# Full Content

This is detailed content that explains everything thoroughly.
With multiple paragraphs and extensive documentation.
Including code examples and edge cases.`
      )

      const skill = loadSkill("token-test", testDir)!

      const fullFormatted = formatSkillsForInjection([skill], { useSummaries: false })
      const summaryFormatted = formatSkillsForInjection([skill], { useSummaries: true })

      const fullTokens = Math.ceil(fullFormatted.length / 4)
      const summaryTokens = Math.ceil(summaryFormatted.length / 4)

      expect(summaryTokens).toBeLessThan(fullTokens)
    })

    it("minification reduces token count", () => {
      createSkill(
        "verbose",
        `---
name: verbose
---

# Title


<!-- comment -->

Content    with    extra    spaces


And blank lines`
      )

      const skill = loadSkill("verbose", testDir)!

      const original = formatSkillsForInjection([skill], { useMinification: false })
      const minified = formatSkillsForInjection([skill], { useMinification: true })

      const originalTokens = Math.ceil(original.length / 4)
      const minifiedTokens = Math.ceil(minified.length / 4)

      expect(minifiedTokens).toBeLessThan(originalTokens)
    })
  })
})
