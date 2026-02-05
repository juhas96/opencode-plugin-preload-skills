import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function matchGlobPattern(filePath: string, pattern: string): boolean {
  let regexPattern = pattern
    .replace(/\*\*\//g, "\x00DOUBLESTARSLASH\x00")
    .replace(/\*\*/g, "\x00DOUBLESTAR\x00")
    .replace(/\*/g, "\x00SINGLESTAR\x00")
    .replace(/\?/g, "\x00QUESTION\x00")
  
  regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  
  regexPattern = regexPattern
    .replace(/\x00DOUBLESTARSLASH\x00/g, "(?:[^/]+/)*")
    .replace(/\x00DOUBLESTAR\x00/g, ".*")
    .replace(/\x00SINGLESTAR\x00/g, "[^/]*")
    .replace(/\x00QUESTION\x00/g, "[^/]")

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(filePath)
}

export function matchesAnyPattern(
  filePath: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchGlobPattern(filePath, pattern))
}

export function checkCondition(
  condition: { fileExists?: string; packageHasDependency?: string; envVar?: string },
  projectDir: string
): boolean {
  if (condition.fileExists) {
    const fullPath = join(projectDir, condition.fileExists)
    if (!existsSync(fullPath)) return false
  }

  if (condition.packageHasDependency) {
    const packageJsonPath = join(projectDir, "package.json")
    if (!existsSync(packageJsonPath)) return false

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }
      if (!deps[condition.packageHasDependency]) return false
    } catch {
      return false
    }
  }

  if (condition.envVar) {
    if (!process.env[condition.envVar]) return false
  }

  return true
}

export function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []
  return [...new Set(words)]
}

export function textContainsKeyword(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase()
  return keywords.some((kw) => lowerText.includes(kw.toLowerCase()))
}

export function minifyContent(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
}

export function minifyContentAggressive(text: string): string {
  let result = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "")

  result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_, _hashes, title) => `[${title.toUpperCase()}]`)

  result = result.replace(/\*\*([^*]+)\*\*/g, "$1")
  result = result.replace(/\*([^*]+)\*/g, "$1")
  result = result.replace(/__([^_]+)__/g, "$1")
  result = result.replace(/(?<=\s|^)_([^_\s]+)_(?=\s|$|[.,;:!?])/gm, "$1")

  result = result.replace(/```\w*\n([\s\S]*?)```/g, (_, code) => {
    return code
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join("|")
  })

  result = result.replace(/^[-*+]\s+(.+)$/gm, "|$1")
  result = result.replace(/^\d+\.\s+(.+)$/gm, "|$1")

  result = result.replace(/(\|\S[^|]*)\n(\|)/g, "$1$2")

  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  result = result
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")

  result = result.replace(
    /\b(MANDATORY|FORBIDDEN|CRITICAL|NEVER|ALWAYS|MUST|REQUIRED)\b/g,
    ">>>$1<<<"
  )

  return result
}
