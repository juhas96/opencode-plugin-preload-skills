import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { ParsedSkill } from "./types.js"

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

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch?.[1]) {
    return {}
  }

  const frontmatter = frontmatterMatch[1]
  const result: { name?: string; description?: string } = {}

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
  if (nameMatch?.[1]) {
    result.name = nameMatch[1].trim()
  }

  const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
  if (descMatch?.[1]) {
    result.description = descMatch[1].trim()
  }

  return result
}

export function loadSkill(skillName: string, projectDir: string): ParsedSkill | null {
  const filePath = findSkillFile(skillName, projectDir)

  if (!filePath) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const { name, description } = parseFrontmatter(content)

    return {
      name: name ?? skillName,
      description: description ?? "",
      content,
      filePath,
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

export function formatSkillsForInjection(skills: ParsedSkill[]): string {
  if (!Array.isArray(skills) || skills.length === 0) {
    return ""
  }

  const parts = skills.map(
    (skill) =>
      `<preloaded-skill name="${skill.name}">\n${skill.content}\n</preloaded-skill>`
  )

  return `<preloaded-skills>
The following skills have been automatically loaded for this session:

${parts.join("\n\n")}
</preloaded-skills>`
}
