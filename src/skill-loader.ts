import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { ParsedSkill } from "./types.js"
import { estimateTokens } from "./utils.js"

const SKILL_FILENAME = "SKILL.md"

const SKILL_SEARCH_PATHS = [
  (dir: string) => join(dir, ".opencode", "skills"),
  (dir: string) => join(dir, ".claude", "skills"),
  () => join(homedir(), ".config", "opencode", "skills"),
  () => join(homedir(), ".claude", "skills"),
]

function findSkillFile(skillName: string, projectDir: string): string | null {
  for (const getPath of SKILL_SEARCH_PATHS) {
    const skillDir = getPath(projectDir)
    const skillPath = join(skillDir, skillName, SKILL_FILENAME)

    if (existsSync(skillPath)) {
      return skillPath
    }
  }
  return null
}

interface FrontmatterData {
  name?: string
  description?: string
  summary?: string
}

function parseFrontmatter(content: string): FrontmatterData {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch?.[1]) {
    return {}
  }

  const frontmatter = frontmatterMatch[1]
  const result: FrontmatterData = {}

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  if (nameMatch?.[1]) {
    result.name = nameMatch[1].trim()
  }

  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (descMatch?.[1]) {
    result.description = descMatch[1].trim()
  }

  const summaryMatch = frontmatter.match(/^summary:\s*(.+)$/m)
  if (summaryMatch?.[1]) {
    result.summary = summaryMatch[1].trim()
  }

  return result
}

function extractAutoSummary(content: string, maxLength: number = 500): string {
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
  
  const firstSection = withoutFrontmatter.split(/\n##\s/)[0] ?? ""
  const cleaned = firstSection
    .replace(/^#\s+.+\n?/, "")
    .replace(/\n+/g, " ")
    .trim()

  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength).replace(/\s+\S*$/, "") + "..."
}

export function loadSkill(skillName: string, projectDir: string): ParsedSkill | null {
  const filePath = findSkillFile(skillName, projectDir)

  if (!filePath) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const { name, description, summary } = parseFrontmatter(content)

    return {
      name: name ?? skillName,
      description: description ?? "",
      summary: summary ?? extractAutoSummary(content),
      content,
      filePath,
      tokenCount: estimateTokens(content),
    }
  } catch {
    return null
  }
}

export function loadSkills(skillNames: string[], projectDir: string): ParsedSkill[] {
  if (!Array.isArray(skillNames)) {
    return []
  }

  const skills: ParsedSkill[] = []

  for (const name of skillNames) {
    const skill = loadSkill(name, projectDir)
    if (skill) {
      skills.push(skill)
    }
  }

  return skills
}

export function formatSkillsForInjection(
  skills: ParsedSkill[],
  useSummaries: boolean = false
): string {
  if (!Array.isArray(skills) || skills.length === 0) {
    return ""
  }

  const parts = skills.map((skill) => {
    const content = useSummaries && skill.summary ? skill.summary : skill.content
    return `<preloaded-skill name="${skill.name}">\n${content}\n</preloaded-skill>`
  })

  return `<preloaded-skills>
The following skills have been automatically loaded for this session:

${parts.join("\n\n")}
</preloaded-skills>`
}

export function calculateTotalTokens(skills: ParsedSkill[]): number {
  return skills.reduce((sum, skill) => sum + skill.tokenCount, 0)
}

export function filterSkillsByTokenBudget(
  skills: ParsedSkill[],
  maxTokens: number
): ParsedSkill[] {
  const result: ParsedSkill[] = []
  let totalTokens = 0

  for (const skill of skills) {
    if (totalTokens + skill.tokenCount <= maxTokens) {
      result.push(skill)
      totalTokens += skill.tokenCount
    }
  }

  return result
}
