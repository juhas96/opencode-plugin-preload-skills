import { createPluginRuntime } from "../core/runtime.js"
import { formatSkillsForInjection } from "../skills/loader.js"
import { textContainsKeyword, stripIgnoredTags } from "../utils.js"
import { extname } from "node:path"
import type { ParsedSkill, ToastVariant } from "../types.js"

export interface V1PluginInput {
  directory?: string
  client?: {
    tui?: {
      showToast?: (options: {
        title?: string
        message?: string
        variant?: "info" | "success" | "warning" | "error"
      }) => Promise<void> | void
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

const FILE_TOOLS = ["read", "edit", "write", "glob", "grep"]

function getFilePathFromArgs(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const record = args as Record<string, unknown>
  if (typeof record.filePath === "string") return record.filePath
  if (typeof record.path === "string") return record.path
  if (typeof record.file === "string") return record.file
  return null
}

export async function server(ctx: V1PluginInput): Promise<Record<string, unknown>> {
  const projectDir = ctx.directory ?? process.cwd()

  const customToast = (message: string, variant: ToastVariant = "info") => {
    if (!runtime?.config?.showToasts && runtime !== undefined) return
    if (ctx.client?.tui?.showToast) {
      void ctx.client.tui.showToast({
        title: "Preload Skills",
        message,
        variant,
      })
    }
  }

  const runtime = createPluginRuntime({
    projectDir,
    customToast,
  })

  const { config, sessionManager, skillResolver, initialSkills, log, toast } = runtime

  const handleSystemPrompt = (
    system: string[],
    sessionID: string,
    agent?: string
  ) => {
    const state = sessionManager.getState(sessionID)

    if (agent && config.agentSkills?.[agent]) {
      const result = skillResolver.loadWithBudget(
        config.agentSkills[agent]!,
        state.totalTokensUsed,
        sessionID,
        "agent"
      )
      if (result.skills.length > 0) {
        sessionManager.queueSkills(sessionID, result.skills, "agent")
      }
    }

    const skillsToInject: ParsedSkill[] = []

    if (initialSkills.length > 0) {
      skillsToInject.push(...initialSkills)
    }

    for (const name of state.loadedSkills) {
      const skill = sessionManager.getCachedSkill(name)
      if (skill && !skillsToInject.find((s) => s.name === name)) {
        skillsToInject.push(skill)
      }
    }

    const pending = sessionManager.getPendingSkills(sessionID)
    if (pending && pending.length > 0) {
      for (const skill of pending) {
        if (!skillsToInject.find((s) => s.name === skill.name)) {
          skillsToInject.push(skill)
        }
      }
      sessionManager.clearPendingSkills(sessionID)
    }

    if (skillsToInject.length > 0) {
      const formatted = formatSkillsForInjection(skillsToInject, {
        useSummaries: config.useSummaries,
        useMinification: config.useMinification,
        skillSettings: config.skillSettings,
      })

      // Push formatted skills string directly to output.system (string[])
      system.push(formatted)

      if (!state.initialSkillsInjected && initialSkills.length > 0) {
        state.initialSkillsInjected = true
        const names = initialSkills.map((s) => s.name)
        log("info", "Injected skills into system prompt", {
          sessionID,
          skills: names,
        })
        toast(`Loaded ${names.length} skill${names.length === 1 ? "" : "s"}: ${names.join(", ")}`)
      }

      if (pending && pending.length > 0) {
        const pendingNames = pending.map((s) => s.name)
        toast(`Triggered skill${pendingNames.length === 1 ? "" : "s"}: ${pendingNames.join(", ")}`)
      }
    }
  }

  const isChatMessage = config.injectionMethod === "chatMessage"

  const hooks: Record<string, unknown> = {
    ...(isChatMessage
      ? {}
      : {
          // V1 chat system transform hook
          "experimental.chat.system.transform": async (
            input: { sessionID?: string; agent?: string },
            output: { system?: string[] }
          ) => {
            const sessionID = input?.sessionID
            if (!sessionID) return

            output.system = output.system ?? []
            handleSystemPrompt(output.system, sessionID, input.agent)
          },
        }),

    "chat.message": async (
      input: { sessionID?: string; agent?: string },
      output: {
        message?: { content?: string; text?: string; parts?: unknown }
        parts?: Array<{ type?: string; text?: string }>
      }
    ) => {
      const sessionID = input?.sessionID
      if (!sessionID) return

      let rawText: string | undefined

      if (Array.isArray(output?.parts)) {
        rawText = output.parts
          .filter(
            (p) =>
              p != null &&
              typeof p === "object" &&
              p.type === "text" &&
              typeof p.text === "string"
          )
          .map((p) => p.text)
          .join(" ")
      }

      if (!rawText) {
        rawText =
          output?.message?.text ??
          (typeof output?.message?.content === "string" ? output.message.content : undefined) ??
          (Array.isArray(output?.message?.parts)
            ? (output.message.parts as any[])
                .filter(
                  (p: any) =>
                    p != null &&
                    typeof p === "object" &&
                    p.type === "text" &&
                    typeof p.text === "string"
                )
                .map((p: any) => p.text)
                .join(" ")
            : undefined)
      }

      if (rawText && typeof rawText === "string") {
        const messageText = stripIgnoredTags(
          rawText,
          config.triggerIgnoreTags ?? []
        )

        if (config.contentTriggers) {
          const state = sessionManager.getState(sessionID)
          for (const [keyword, skillNames] of Object.entries(config.contentTriggers)) {
            if (textContainsKeyword(messageText, [keyword])) {
              const result = skillResolver.loadWithBudget(
                skillNames,
                state.totalTokensUsed,
                sessionID,
                "content"
              )
              if (result.skills.length > 0) {
                sessionManager.queueSkills(sessionID, result.skills, "content")
              }
            }
          }
        }
      }

      // If injectionMethod is chatMessage, inject skills into chat message output
      if (isChatMessage) {
        const state = sessionManager.getState(sessionID)

        if (input.agent && config.agentSkills?.[input.agent]) {
          const result = skillResolver.loadWithBudget(
            config.agentSkills[input.agent]!,
            state.totalTokensUsed,
            sessionID,
            "agent"
          )
          if (result.skills.length > 0) {
            sessionManager.queueSkills(sessionID, result.skills, "agent")
          }
        }

        const skillsToInject: ParsedSkill[] = []

        if (!state.initialSkillsInjected && initialSkills.length > 0) {
          skillsToInject.push(...initialSkills)
          state.initialSkillsInjected = true
          const names = initialSkills.map((s) => s.name)
          log("info", "Injected initial skills into chat message", {
            sessionID,
            skills: names,
          })
          toast(`Loaded ${names.length} skill${names.length === 1 ? "" : "s"}: ${names.join(", ")}`)
        }

        const pending = sessionManager.getPendingSkills(sessionID)
        if (pending && pending.length > 0) {
          for (const skill of pending) {
            if (!skillsToInject.find((s) => s.name === skill.name)) {
              skillsToInject.push(skill)
            }
          }
          sessionManager.clearPendingSkills(sessionID)
          const pendingNames = pending.map((s) => s.name)
          toast(`Triggered skill${pendingNames.length === 1 ? "" : "s"}: ${pendingNames.join(", ")}`)
        }

        if (skillsToInject.length > 0) {
          const formatted = formatSkillsForInjection(skillsToInject, {
            useSummaries: config.useSummaries,
            useMinification: config.useMinification,
            skillSettings: config.skillSettings,
          })

          if (Array.isArray(output.parts)) {
            output.parts.push({ type: "text", text: formatted })
          } else if (Array.isArray((output.message as any)?.parts)) {
            (output.message as any).parts.push({ type: "text", text: formatted })
          } else if (output.message && typeof output.message === "object") {
            if (typeof output.message.content === "string") {
              output.message.content = `${output.message.content}\n\n${formatted}`
            } else if (typeof output.message.text === "string") {
              output.message.text = `${output.message.text}\n\n${formatted}`
            } else {
              output.message.content = formatted
            }
          } else {
            output.parts = [{ type: "text", text: formatted }]
          }
        }
      }
    },

    // V1 tool execution tracking
    "tool.execute.after": async (
      input: { tool: string; sessionID?: string; callID?: string; args?: unknown },
      output: { args?: unknown; result?: unknown }
    ) => {
      const sessionID = input?.sessionID
      if (!sessionID) return
      if (!FILE_TOOLS.includes(input.tool)) return

      const filePath = getFilePathFromArgs(input.args) ?? getFilePathFromArgs(output?.args)
      if (!filePath) return

      const state = sessionManager.getState(sessionID)
      const ext = extname(filePath)

      if (ext && config.fileTypeSkills) {
        const extSkillNames = skillResolver.getSkillsForExtension(ext)
        if (extSkillNames.length > 0) {
          const result = skillResolver.loadWithBudget(
            extSkillNames,
            state.totalTokensUsed,
            sessionID,
            "fileType"
          )
          if (result.skills.length > 0) {
            sessionManager.queueSkills(sessionID, result.skills, "fileType")
          }
        }
      }

      if (config.pathPatterns) {
        const pathSkillNames = skillResolver.getSkillsForPath(filePath)
        if (pathSkillNames.length > 0) {
          const result = skillResolver.loadWithBudget(
            pathSkillNames,
            state.totalTokensUsed,
            sessionID,
            "path"
          )
          if (result.skills.length > 0) {
            sessionManager.queueSkills(sessionID, result.skills, "path")
          }
        }
      }
    },

    // V1 compaction hook
    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context?: string[]; system?: Array<{ type?: string; text?: string } | string> }
    ) => {
      if (!config.persistAfterCompaction) return
      const sessionID = input?.sessionID
      if (!sessionID) return

      const allLoadedSkills = sessionManager.getAllLoadedSkills(sessionID)
      if (allLoadedSkills.length === 0) return

      const formatted = formatSkillsForInjection(allLoadedSkills, {
        useSummaries: config.useSummaries,
        useMinification: config.useMinification,
        skillSettings: config.skillSettings,
      })

      const persistentText = `## Preloaded Skills\n\nThe following skills were loaded during this session and should persist:\n\n${formatted}`
      output.context = output.context ?? []
      output.context.push(persistentText)

      sessionManager.markInitialSkillsInjected(sessionID)
      sessionManager.saveAnalytics()
    },

    // V1 event handler for session cleanup
    event: async ({ event }: { event: { type: string; properties?: { sessionID?: string }; data?: { sessionID?: string } } }) => {
      const sid = (event as any)?.properties?.sessionID ?? (event as any)?.data?.sessionID
      if (event?.type === "session.deleted" && sid) {
        sessionManager.cleanup(sid)
      }
    },

    dispose: () => {
      sessionManager.saveAnalytics()
    },
  }

  // Register loaded_skills tool if enabled
  if (config.enableTools !== false) {
    hooks.tool = {
      loaded_skills: {
        description: "List all preloaded skills for the current session — names, descriptions, and token counts.",
        args: {},
        async execute(_args: unknown, context: { sessionID: string }) {
          const sessionID = context?.sessionID
          const state = sessionManager.getState(sessionID)
          const skills = sessionManager.getAllLoadedSkills(sessionID)

          if (skills.length === 0) {
            return "No skills currently loaded for this session."
          }

          const skillInfos = skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            tokens: skill.tokenCount,
          }))

          const totalTokens = skillInfos.reduce((sum, s) => sum + s.tokens, 0)
          const lines = skillInfos.map(
            (s) => `- **${s.name}** (${s.tokens} tokens) — ${s.description}`
          )

          return [
            `**${skillInfos.length} skill${skillInfos.length === 1 ? "" : "s"} loaded** (${totalTokens} total tokens)`,
            "",
            ...lines,
            "",
            `Token budget: ${state.totalTokensUsed} used`,
          ].join("\n")
        },
      },
    }
  }

  return hooks
}
