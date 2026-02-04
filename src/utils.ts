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
