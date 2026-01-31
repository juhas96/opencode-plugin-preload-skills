export interface PreloadSkillsConfig {
  skills: string[]
  fileTypeSkills?: Record<string, string[]>
  persistAfterCompaction?: boolean
  debug?: boolean
}

export interface ParsedSkill {
  name: string
  description: string
  content: string
  filePath: string
}

export interface SessionState {
  initialSkillsInjected: boolean
  loadedSkills: Set<string>
}
