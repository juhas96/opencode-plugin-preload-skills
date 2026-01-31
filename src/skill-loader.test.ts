import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  loadSkill,
  loadSkills,
  formatSkillsForInjection,
  calculateTotalTokens,
  filterSkillsByTokenBudget,
} from "./skill-loader.js"
import type { ParsedSkill } from "./types.js"

describe("skill-loader", () => {
  const testDir = join(process.cwd(), ".test-skills")
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

  describe("loadSkill", () => {
    it("loads skill with frontmatter", () => {
      createSkill(
        "test-skill",
        `---
name: test-skill
description: A test skill
summary: Short summary
---

# Test Content

This is the skill content.`
      )

      const skill = loadSkill("test-skill", testDir)

      expect(skill).not.toBeNull()
      expect(skill!.name).toBe("test-skill")
      expect(skill!.description).toBe("A test skill")
      expect(skill!.summary).toBe("Short summary")
      expect(skill!.content).toContain("# Test Content")
      expect(skill!.tokenCount).toBeGreaterThan(0)
    })

    it("uses skill name as fallback when no name in frontmatter", () => {
      createSkill(
        "unnamed-skill",
        `---
description: No name field
---

Content here.`
      )

      const skill = loadSkill("unnamed-skill", testDir)

      expect(skill!.name).toBe("unnamed-skill")
    })

    it("auto-generates summary when not provided", () => {
      createSkill(
        "no-summary",
        `---
name: no-summary
description: Test
---

# First Section

This is the first paragraph that should become the auto-summary.

## Second Section

More content here.`
      )

      const skill = loadSkill("no-summary", testDir)

      expect(skill!.summary).toContain("This is the first paragraph")
    })

    it("returns null for non-existent skill", () => {
      const skill = loadSkill("missing-skill", testDir)
      expect(skill).toBeNull()
    })

    it("handles skill without frontmatter", () => {
      createSkill("no-frontmatter", "# Just Content\n\nNo frontmatter here.")

      const skill = loadSkill("no-frontmatter", testDir)

      expect(skill).not.toBeNull()
      expect(skill!.name).toBe("no-frontmatter")
      expect(skill!.description).toBe("")
    })

    it("truncates auto-summary when content is very long", () => {
      const longParagraph = "This is a very long paragraph. ".repeat(50)
      createSkill(
        "long-content",
        `---
name: long-content
description: Test
---

# Title

${longParagraph}

## Next Section`
      )

      const skill = loadSkill("long-content", testDir)

      expect(skill!.summary).not.toBeNull()
      expect(skill!.summary!.length).toBeLessThanOrEqual(503)
      expect(skill!.summary).toMatch(/\.\.\.$/,)
    })

    it("returns null when file read fails", () => {
      const skillDir = join(skillsDir, "unreadable-skill")
      mkdirSync(skillDir, { recursive: true })
      mkdirSync(join(skillDir, "SKILL.md"))

      const skill = loadSkill("unreadable-skill", testDir)

      expect(skill).toBeNull()
    })

    it("calculates token count", () => {
      createSkill(
        "token-test",
        `---
name: token-test
description: Test
---

${"a".repeat(100)}`
      )

      const skill = loadSkill("token-test", testDir)

      expect(skill!.tokenCount).toBeGreaterThan(25)
    })
  })

  describe("loadSkills", () => {
    it("loads multiple skills", () => {
      createSkill("skill-a", "---\nname: skill-a\ndescription: A\n---\nContent A")
      createSkill("skill-b", "---\nname: skill-b\ndescription: B\n---\nContent B")

      const skills = loadSkills(["skill-a", "skill-b"], testDir)

      expect(skills).toHaveLength(2)
      expect(skills[0]!.name).toBe("skill-a")
      expect(skills[1]!.name).toBe("skill-b")
    })

    it("skips missing skills", () => {
      createSkill("exists", "---\nname: exists\ndescription: E\n---\nContent")

      const skills = loadSkills(["exists", "missing"], testDir)

      expect(skills).toHaveLength(1)
      expect(skills[0]!.name).toBe("exists")
    })

    it("handles empty array", () => {
      const skills = loadSkills([], testDir)
      expect(skills).toEqual([])
    })

    it("handles non-array input gracefully", () => {
      const skills = loadSkills(null as unknown as string[], testDir)
      expect(skills).toEqual([])
    })
  })

  describe("formatSkillsForInjection", () => {
    const mockSkills: ParsedSkill[] = [
      {
        name: "skill-a",
        description: "Skill A",
        summary: "Summary A",
        content: "Content A",
        filePath: "/path/a",
        tokenCount: 10,
      },
      {
        name: "skill-b",
        description: "Skill B",
        summary: "Summary B",
        content: "Content B",
        filePath: "/path/b",
        tokenCount: 20,
      },
    ]

    it("formats skills with full content by default", () => {
      const result = formatSkillsForInjection(mockSkills)

      expect(result).toContain("<preloaded-skills>")
      expect(result).toContain('name="skill-a"')
      expect(result).toContain("Content A")
      expect(result).toContain('name="skill-b"')
      expect(result).toContain("Content B")
    })

    it("uses summaries when useSummaries is true", () => {
      const result = formatSkillsForInjection(mockSkills, true)

      expect(result).toContain("Summary A")
      expect(result).toContain("Summary B")
      expect(result).not.toContain("Content A")
      expect(result).not.toContain("Content B")
    })

    it("returns empty string for empty array", () => {
      expect(formatSkillsForInjection([])).toBe("")
    })

    it("handles non-array gracefully", () => {
      expect(formatSkillsForInjection(null as unknown as ParsedSkill[])).toBe("")
    })

    it("accepts options object for backward compatibility", () => {
      const result = formatSkillsForInjection(mockSkills, { useSummaries: true })

      expect(result).toContain("Summary A")
      expect(result).not.toContain("Content A")
    })

    it("per-skill useSummary overrides global useSummaries=false", () => {
      const result = formatSkillsForInjection(mockSkills, {
        useSummaries: false,
        skillSettings: { "skill-a": { useSummary: true } }
      })

      expect(result).toContain("Summary A")
      expect(result).not.toContain("Content A")
      expect(result).toContain("Content B")
      expect(result).not.toContain("Summary B")
    })

    it("per-skill useSummary overrides global useSummaries=true", () => {
      const result = formatSkillsForInjection(mockSkills, {
        useSummaries: true,
        skillSettings: { "skill-b": { useSummary: false } }
      })

      expect(result).toContain("Summary A")
      expect(result).not.toContain("Content A")
      expect(result).toContain("Content B")
      expect(result).not.toContain("Summary B")
    })

    it("skills without settings follow global useSummaries", () => {
      const result = formatSkillsForInjection(mockSkills, {
        useSummaries: true,
        skillSettings: {}
      })

      expect(result).toContain("Summary A")
      expect(result).toContain("Summary B")
      expect(result).not.toContain("Content A")
      expect(result).not.toContain("Content B")
    })
  })

  describe("calculateTotalTokens", () => {
    it("sums token counts", () => {
      const skills: ParsedSkill[] = [
        { name: "a", description: "", content: "", filePath: "", tokenCount: 100, summary: "" },
        { name: "b", description: "", content: "", filePath: "", tokenCount: 200, summary: "" },
        { name: "c", description: "", content: "", filePath: "", tokenCount: 50, summary: "" },
      ]

      expect(calculateTotalTokens(skills)).toBe(350)
    })

    it("returns 0 for empty array", () => {
      expect(calculateTotalTokens([])).toBe(0)
    })
  })

  describe("filterSkillsByTokenBudget", () => {
    const skills: ParsedSkill[] = [
      { name: "small", description: "", content: "", filePath: "", tokenCount: 100, summary: "" },
      { name: "medium", description: "", content: "", filePath: "", tokenCount: 200, summary: "" },
      { name: "large", description: "", content: "", filePath: "", tokenCount: 500, summary: "" },
    ]

    it("includes skills until budget is exhausted", () => {
      const result = filterSkillsByTokenBudget(skills, 350)

      expect(result).toHaveLength(2)
      expect(result[0]!.name).toBe("small")
      expect(result[1]!.name).toBe("medium")
    })

    it("includes all skills if budget is sufficient", () => {
      const result = filterSkillsByTokenBudget(skills, 1000)

      expect(result).toHaveLength(3)
    })

    it("includes no skills if budget is 0", () => {
      const result = filterSkillsByTokenBudget(skills, 0)

      expect(result).toHaveLength(0)
    })

    it("skips skills that exceed remaining budget", () => {
      const result = filterSkillsByTokenBudget(skills, 150)

      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe("small")
    })
  })
})
