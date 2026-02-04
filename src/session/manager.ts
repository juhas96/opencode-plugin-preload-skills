import { existsSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import type {
  SessionState,
  ParsedSkill,
  AnalyticsData,
  TriggerType,
  PreloadSkillsConfig,
  Logger,
  SessionManager,
} from "../types.js"

const ANALYTICS_FILENAME = "preload-skills-analytics.json"

export class SessionManagerImpl implements SessionManager {
  private readonly sessions = new Map<string, SessionState>()
  private readonly analytics = new Map<string, AnalyticsData>()
  private readonly pendingSkills = new Map<string, ParsedSkill[]>()
  private readonly pendingFilePaths = new Map<string, string>()
  private readonly skillCache = new Map<string, ParsedSkill>()

  constructor(
    private readonly config: PreloadSkillsConfig,
    private readonly projectDir: string,
    private readonly log: Logger,
    private readonly initialSkillNames: Set<string>,
    private readonly initialTokensUsed: number
  ) {}

  getState(sessionId: string): SessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        initialSkillsInjected: false,
        loadedSkills: new Set(this.initialSkillNames),
        totalTokensUsed: this.initialTokensUsed,
      })
    }
    return this.sessions.get(sessionId)!
  }

  queueSkills(sessionId: string, skills: ParsedSkill[], triggerType: TriggerType): void {
    const state = this.getState(sessionId)
    const newSkills = skills.filter(s => !state.loadedSkills.has(s.name))

    if (newSkills.length === 0) return

    let tokensAdded = 0
    for (const skill of newSkills) {
      state.loadedSkills.add(skill.name)
      this.skillCache.set(skill.name, skill)
      tokensAdded += skill.tokenCount
      this.trackUsage(sessionId, skill.name, triggerType)
    }
    state.totalTokensUsed += tokensAdded

    const existing = this.pendingSkills.get(sessionId) ?? []
    this.pendingSkills.set(sessionId, [...existing, ...newSkills])

    this.log("debug", `Queued ${triggerType} skills for injection`, {
      sessionId,
      skills: newSkills.map(s => s.name),
      tokens: tokensAdded,
    })
  }

  getPendingSkills(sessionId: string): ParsedSkill[] {
    return this.pendingSkills.get(sessionId) ?? []
  }

  clearPendingSkills(sessionId: string): void {
    this.pendingSkills.delete(sessionId)
  }

  getAllLoadedSkills(sessionId: string): ParsedSkill[] {
    const state = this.sessions.get(sessionId)
    if (!state) return []

    const skills: ParsedSkill[] = []
    for (const name of state.loadedSkills) {
      const skill = this.skillCache.get(name)
      if (skill) skills.push(skill)
    }
    return skills
  }

  getCachedSkill(name: string): ParsedSkill | undefined {
    return this.skillCache.get(name)
  }

  cacheSkill(skill: ParsedSkill): void {
    this.skillCache.set(skill.name, skill)
  }

  trackFilePath(callId: string, filePath: string): void {
    this.pendingFilePaths.set(callId, filePath)
  }

  getFilePath(callId: string): string | undefined {
    return this.pendingFilePaths.get(callId)
  }

  clearFilePath(callId: string): void {
    this.pendingFilePaths.delete(callId)
  }

  cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.pendingSkills.delete(sessionId)
    this.analytics.delete(sessionId)
    this.log("debug", "Cleaned up session state", { sessionId })
    this.saveAnalytics()
  }

  private trackUsage(sessionId: string, skillName: string, triggerType: TriggerType): void {
    if (!this.config.analytics) return

    if (!this.analytics.has(sessionId)) {
      this.analytics.set(sessionId, {
        sessionId,
        skillUsage: new Map(),
      })
    }

    const data = this.analytics.get(sessionId)!
    const now = Date.now()

    if (data.skillUsage.has(skillName)) {
      const stats = data.skillUsage.get(skillName)!
      stats.loadCount++
      stats.lastLoaded = now
    } else {
      data.skillUsage.set(skillName, {
        skillName,
        loadCount: 1,
        triggerType,
        firstLoaded: now,
        lastLoaded: now,
      })
    }

    this.saveAnalytics()
  }

  saveAnalytics(): void {
    if (!this.config.analytics) return

    try {
      const analyticsPath = join(this.projectDir, ".opencode", ANALYTICS_FILENAME)
      const dir = dirname(analyticsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const serializable: Record<string, unknown> = {}
      for (const [sessionId, data] of this.analytics) {
        serializable[sessionId] = {
          sessionId: data.sessionId,
          skillUsage: Object.fromEntries(data.skillUsage),
        }
      }

      writeFileSync(analyticsPath, JSON.stringify(serializable, null, 2))
    } catch {
      this.log("warn", "Failed to save analytics")
    }
  }

  markInitialSkillsInjected(sessionId: string): void {
    const state = this.getState(sessionId)
    state.initialSkillsInjected = false
  }
}
