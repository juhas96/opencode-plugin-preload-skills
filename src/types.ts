export interface PreloadSkillsConfig {
  skills: string[]
  persistAfterCompaction?: boolean
  debug?: boolean
}

export interface ParsedSkill {
  name: string
  description: string
  content: string
  filePath: string
}
