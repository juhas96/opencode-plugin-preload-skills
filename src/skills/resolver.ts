import type {
  PreloadSkillsConfig,
  ParsedSkill,
  SkillResolver,
  LoadSkillsResult,
  TriggerType,
} from "../types.js"
import { loadSkills, filterSkillsByTokenBudget, calculateTotalTokens } from "./loader.js"
import { matchGlobPattern } from "../utils.js"

export function getSkillsForExtension(
  ext: string,
  fileTypeSkills: Record<string, string[]>
): string[] {
  const skills: string[] = []

  for (const [pattern, skillNames] of Object.entries(fileTypeSkills)) {
    const extensions = pattern.split(",").map((e) => e.trim().toLowerCase())
    if (extensions.includes(ext.toLowerCase())) {
      skills.push(...skillNames)
    }
  }

  return [...new Set(skills)]
}

export function getSkillsForPath(
  filePath: string,
  pathPatterns: Record<string, string[]>
): string[] {
  const skills: string[] = []

  for (const [pattern, skillNames] of Object.entries(pathPatterns)) {
    if (matchGlobPattern(filePath, pattern)) {
      skills.push(...skillNames)
    }
  }

  return [...new Set(skills)]
}

export function resolveSkillGroups(
  skillNames: string[],
  groups: Record<string, string[]>
): string[] {
  const resolved: string[] = []

  for (const name of skillNames) {
    if (name.startsWith("@") && groups[name.slice(1)]) {
      resolved.push(...groups[name.slice(1)]!)
    } else {
      resolved.push(name)
    }
  }

  return [...new Set(resolved)]
}

export class SkillResolverImpl implements SkillResolver {
  private readonly skillCache = new Map<string, ParsedSkill>()

  constructor(
    private readonly config: PreloadSkillsConfig,
    private readonly projectDir: string
  ) {}

  getSkillsForExtension(ext: string): string[] {
    return getSkillsForExtension(ext, this.config.fileTypeSkills ?? {})
  }

  getSkillsForPath(filePath: string): string[] {
    return getSkillsForPath(filePath, this.config.pathPatterns ?? {})
  }

  resolveGroups(skillNames: string[]): string[] {
    return resolveSkillGroups(skillNames, this.config.groups ?? {})
  }

  loadWithBudget(
    skillNames: string[],
    currentTokens: number,
    _sessionId: string,
    _triggerType: TriggerType
  ): LoadSkillsResult {
    const resolved = this.resolveGroups(skillNames)
    let skills = loadSkills(resolved, this.projectDir)

    for (const skill of skills) {
      this.skillCache.set(skill.name, skill)
    }

    if (this.config.maxTokens) {
      const remainingBudget = this.config.maxTokens - currentTokens
      skills = filterSkillsByTokenBudget(skills, remainingBudget)
    }

    return {
      skills,
      tokensUsed: calculateTotalTokens(skills),
    }
  }

  getCachedSkill(name: string): ParsedSkill | undefined {
    return this.skillCache.get(name)
  }

  cacheSkill(skill: ParsedSkill): void {
    this.skillCache.set(skill.name, skill)
  }
}
