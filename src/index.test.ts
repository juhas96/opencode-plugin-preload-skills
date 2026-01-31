import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { PreloadSkillsPlugin } from "./index.js"
import type { PluginInput } from "@opencode-ai/plugin"

describe("PreloadSkillsPlugin", () => {
  const testDir = join(process.cwd(), ".test-plugin")
  const opencodeDir = join(testDir, ".opencode")
  const skillsDir = join(opencodeDir, "skills")

  const createMockContext = (): PluginInput => ({
    client: {
      app: {
        log: vi.fn(),
      },
    } as unknown as PluginInput["client"],
    project: {} as PluginInput["project"],
    directory: testDir,
    worktree: testDir,
    serverUrl: new URL("http://localhost:3000"),
    $: {} as PluginInput["$"],
  })

  const createConfig = (config: Record<string, unknown>) => {
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(join(opencodeDir, "preload-skills.json"), JSON.stringify(config))
  }

  const createSkill = (name: string, content: string) => {
    const skillDir = join(skillsDir, name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), content)
  }

  const createMsgOutput = (text: string) => ({
    message: {},
    parts: [{ type: "text", text }],
  })

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("initialization", () => {
    it("initializes without config file", async () => {
      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks).toBeDefined()
      expect(hooks["chat.message"]).toBeDefined()
      expect(hooks["tool.execute.after"]).toBeDefined()
      expect(hooks["experimental.session.compacting"]).toBeDefined()
      expect(hooks.event).toBeDefined()
    })

    it("loads config from .opencode directory", async () => {
      createConfig({ skills: ["test-skill"], debug: true })
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nContent")

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks).toBeDefined()
      expect(ctx.client.app.log).toHaveBeenCalled()
    })

    it("logs warning when no skills configured", async () => {
      createConfig({})

      const ctx = createMockContext()
      await PreloadSkillsPlugin(ctx)

      expect(ctx.client.app.log).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "warn",
            message: expect.stringContaining("No skills configured"),
          }),
        })
      )
    })

    it("loads initial skills on startup", async () => {
      createSkill("skill-a", "---\nname: skill-a\ndescription: A\n---\nContent A")
      createSkill("skill-b", "---\nname: skill-b\ndescription: B\n---\nContent B")
      createConfig({ skills: ["skill-a", "skill-b"] })

      const ctx = createMockContext()
      await PreloadSkillsPlugin(ctx)

      expect(ctx.client.app.log).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            level: "info",
            message: expect.stringContaining("Loaded 2 initial skills"),
          }),
        })
      )
    })

    it("logs missing skills", async () => {
      createSkill("exists", "---\nname: exists\ndescription: E\n---\nContent")
      createConfig({ skills: ["exists", "missing"] })

      const ctx = createMockContext()
      await PreloadSkillsPlugin(ctx)

      expect(ctx.client.app.log).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            extra: expect.objectContaining({
              missing: ["missing"],
            }),
          }),
        })
      )
    })
  })

  describe("chat.message hook", () => {
    it("injects initial skills on first message", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nSkill Content Here")
      createConfig({ skills: ["test-skill"], injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("User message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("<preloaded-skills>")
      expect(output.parts[0]!.text).toContain("Skill Content Here")
      expect(output.parts[0]!.text).toContain("User message")
    })

    it("does not re-inject skills on subsequent messages", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test-skill"], injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output1 = createMsgOutput("First message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output1)

      const output2 = createMsgOutput("Second message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output2)

      expect(output2.parts[0]!.text).toBe("Second message")
    })

    it("triggers agent-specific skills", async () => {
      createSkill("plan-skill", "---\nname: plan-skill\ndescription: Plan\n---\nPlan Content")
      createConfig({ agentSkills: { plan: ["plan-skill"] }, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session", agent: "plan" }, output)

      expect(output.parts[0]!.text).toContain("Plan Content")
    })

    it("triggers content-based skills", async () => {
      createSkill("db-skill", "---\nname: db-skill\ndescription: DB\n---\nDatabase Content")
      createConfig({ contentTriggers: { database: ["db-skill"] }, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("I need help with database queries")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("Database Content")
    })

    it("handles missing sessionID gracefully", async () => {
      createConfig({ skills: [] })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "" }, output)

      expect(output.parts[0]!.text).toBe("Message")
    })

    it("handles missing text part gracefully", async () => {
      createConfig({ skills: ["test"] })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = { message: {}, parts: [{ type: "image" }] }
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts).toHaveLength(1)
    })
  })

  describe("tool.execute.after hook", () => {
    it("triggers file type skills", async () => {
      createSkill("ts-skill", "---\nname: ts-skill\ndescription: TS\n---\nTypeScript Content")
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] }, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.before"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { args: { filePath: "src/index.ts" } }
      )
      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )

      const output = createMsgOutput("Next message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("TypeScript Content")
    })

    it("triggers path pattern skills", async () => {
      createSkill("api-skill", "---\nname: api-skill\ndescription: API\n---\nAPI Content")
      createConfig({ pathPatterns: { "src/api/**": ["api-skill"] }, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.before"] as Function)(
        { tool: "edit", sessionID: "test-session", callID: "call-1" },
        { args: { filePath: "src/api/users.ts" } }
      )
      await (hooks["tool.execute.after"] as Function)(
        { tool: "edit", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("API Content")
    })

    it("ignores non-file tools", async () => {
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] } })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.after"] as Function)(
        { tool: "bash", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: { args: { filePath: "test.ts" } } }
      )
    })

    it("handles missing metadata gracefully", async () => {
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] } })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )
    })

    it("handles various file path argument names", async () => {
      createSkill("ts-skill", "---\nname: ts-skill\ndescription: TS\n---\nTS Content")
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] } })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.before"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { args: { path: "test.ts" } }
      )
      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )

      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session-2", callID: "call-2" },
        { title: "", output: "", metadata: { args: { file: "test2.ts" } } }
      )
    })

    it("handles missing sessionID gracefully", async () => {
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] } })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "", callID: "call-1" },
        { title: "", output: "", metadata: { args: { filePath: "test.ts" } } }
      )
    })

    it("handles args without file path gracefully", async () => {
      createConfig({ fileTypeSkills: { ".ts": ["ts-skill"] } })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: { args: { someOtherArg: "value" } } }
      )
    })
  })

  describe("experimental.session.compacting hook", () => {
    it("adds loaded skills to compaction context", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test-skill"], persistAfterCompaction: true })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const msgOutput = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, msgOutput)

      const compactOutput = { context: [] as string[], prompt: undefined }
      await (hooks["experimental.session.compacting"] as Function)({ sessionID: "test-session" }, compactOutput)

      expect(compactOutput.context).toHaveLength(1)
      expect(compactOutput.context[0]).toContain("Preloaded Skills")
    })

    it("respects persistAfterCompaction=false", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test-skill"], persistAfterCompaction: false })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const msgOutput = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, msgOutput)

      const compactOutput = { context: [] as string[], prompt: undefined }
      await (hooks["experimental.session.compacting"] as Function)({ sessionID: "test-session" }, compactOutput)

      expect(compactOutput.context).toHaveLength(0)
    })

    it("handles unknown session gracefully", async () => {
      createConfig({ skills: [], persistAfterCompaction: true })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const compactOutput = { context: [] as string[], prompt: undefined }
      await (hooks["experimental.session.compacting"] as Function)({ sessionID: "unknown-session" }, compactOutput)

      expect(compactOutput.context).toHaveLength(0)
    })
  })

  describe("event hook", () => {
    it("cleans up session state on session.deleted", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test-skill"], debug: true })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const msgOutput = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, msgOutput)

      await (hooks.event as Function)({
        event: {
          type: "session.deleted",
          properties: { sessionID: "test-session" },
        },
      })

      expect(ctx.client.app.log).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            message: "Cleaned up session state",
          }),
        })
      )
    })

    it("ignores non-session.deleted events", async () => {
      createConfig({})

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks.event as Function)({
        event: {
          type: "message.updated",
          properties: {},
        },
      })
    })
  })

  describe("conditional skills", () => {
    it("loads skill when file exists condition is met", async () => {
      createSkill("prisma-skill", "---\nname: prisma-skill\ndescription: Prisma\n---\nPrisma Content")
      mkdirSync(join(testDir, "prisma"), { recursive: true })
      writeFileSync(join(testDir, "prisma", "schema.prisma"), "model User {}")
      createConfig({
        conditionalSkills: [
          { skill: "prisma-skill", if: { fileExists: "prisma/schema.prisma" } }
        ],
        injectionMethod: "chatMessage"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("Prisma Content")
    })

    it("loads skill when package dependency condition is met", async () => {
      createSkill("react-skill", "---\nname: react-skill\ndescription: React\n---\nReact Content")
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ dependencies: { react: "^18" } }))
      createConfig({
        conditionalSkills: [
          { skill: "react-skill", if: { packageHasDependency: "react" } }
        ],
        injectionMethod: "chatMessage"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("React Content")
    })

    it("skips skill when condition is not met", async () => {
      createSkill("react-skill", "---\nname: react-skill\ndescription: React\n---\nReact Content")
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ dependencies: { vue: "^3" } }))
      createConfig({
        conditionalSkills: [
          { skill: "react-skill", if: { packageHasDependency: "react" } }
        ]
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).not.toContain("React Content")
    })
  })

  describe("skill groups", () => {
    it("expands group references", async () => {
      createSkill("react", "---\nname: react\ndescription: React\n---\nReact Content")
      createSkill("css", "---\nname: css\ndescription: CSS\n---\nCSS Content")
      createConfig({
        groups: { frontend: ["react", "css"] },
        skills: ["@frontend"],
        injectionMethod: "chatMessage"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("React Content")
      expect(output.parts[0]!.text).toContain("CSS Content")
    })
  })

  describe("token budget", () => {
    it("respects maxTokens limit", async () => {
      createSkill("small", "---\nname: small\ndescription: Small\n---\nSmall")
      createSkill("large", "---\nname: large\ndescription: Large\n---\n" + "x".repeat(10000))
      createConfig({
        skills: ["small", "large"],
        maxTokens: 100,
        injectionMethod: "chatMessage"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("Small")
      expect(output.parts[0]!.text).not.toContain("xxxx")
    })
  })

  describe("useSummaries", () => {
    it("uses summaries when enabled", async () => {
      createSkill("test", "---\nname: test\ndescription: Test\nsummary: Brief summary\n---\nFull content here")
      createConfig({ skills: ["test"], useSummaries: true, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("Brief summary")
      expect(output.parts[0]!.text).not.toContain("Full content here")
    })
  })

  describe("skillSettings", () => {
    it("applies per-skill summary settings", async () => {
      createSkill("full", "---\nname: full\ndescription: Full\nsummary: Full summary\n---\nFull content")
      createSkill("brief", "---\nname: brief\ndescription: Brief\nsummary: Brief summary\n---\nBrief content")
      createConfig({
        skills: ["full", "brief"],
        useSummaries: false,
        skillSettings: { brief: { useSummary: true } },
        injectionMethod: "chatMessage"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("Full content")
      expect(output.parts[0]!.text).toContain("Brief summary")
      expect(output.parts[0]!.text).not.toContain("Brief content")
    })
  })

  describe("analytics", () => {
    it("tracks skill usage when enabled", async () => {
      createSkill("test", "---\nname: test\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test"], analytics: true })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      const compactOutput = { context: [] as string[], prompt: undefined }
      await (hooks["experimental.session.compacting"] as Function)({ sessionID: "test-session" }, compactOutput)
    })

    it("saves analytics to file on session delete", async () => {
      createSkill("test", "---\nname: test\ndescription: Test\n---\nContent")
      createConfig({ skills: ["test"], analytics: true })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      await (hooks.event as Function)({
        event: {
          type: "session.deleted",
          properties: { sessionID: "test-session" },
        },
      })
    })
  })

  describe("config parsing", () => {
    it("handles malformed config gracefully", async () => {
      mkdirSync(opencodeDir, { recursive: true })
      writeFileSync(join(opencodeDir, "preload-skills.json"), "invalid json {{{")

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks).toBeDefined()
    })

    it("parses all config options", async () => {
      createSkill("test", "---\nname: test\ndescription: Test\n---\nContent")
      createConfig({
        skills: ["test"],
        fileTypeSkills: { ".ts": ["ts-skill"] },
        agentSkills: { plan: ["plan-skill"] },
        pathPatterns: { "src/**": ["src-skill"] },
        contentTriggers: { database: ["db-skill"] },
        groups: { frontend: ["react"] },
        conditionalSkills: [{ skill: "cond", if: { fileExists: "test" } }],
        skillSettings: { test: { useSummary: true } },
        maxTokens: 5000,
        useSummaries: true,
        analytics: true,
        persistAfterCompaction: true,
        debug: true
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks).toBeDefined()
    })
  })

  describe("multiple file extension support", () => {
    it("supports comma-separated extensions", async () => {
      createSkill("jsx-skill", "---\nname: jsx-skill\ndescription: JSX\n---\nJSX Content")
      createConfig({ fileTypeSkills: { ".jsx,.tsx": ["jsx-skill"] }, injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.before"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { args: { filePath: "Component.tsx" } }
      )
      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )

      const output = createMsgOutput("Message")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, output)

      expect(output.parts[0]!.text).toContain("JSX Content")
    })
  })

  describe("injectionMethod config", () => {
    it("defaults to systemPrompt injection method", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nTest Content")
      createConfig({ skills: ["test-skill"] })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks["experimental.chat.system.transform"]).toBeDefined()
      expect(hooks["chat.message"]).toBeDefined()
    })

    it("uses chatMessage injection when explicitly configured", async () => {
      createSkill("test-skill", "---\nname: test-skill\ndescription: Test\n---\nTest Content")
      createConfig({ skills: ["test-skill"], injectionMethod: "chatMessage" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks["experimental.chat.system.transform"]).toBeUndefined()
      expect(hooks["chat.message"]).toBeDefined()
    })

    it("injects skills into system prompt array", async () => {
      createSkill("sys-skill", "---\nname: sys-skill\ndescription: System\n---\nSystem Skill Content")
      createConfig({ skills: ["sys-skill"], injectionMethod: "systemPrompt" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const systemOutput = { system: [] as string[] }
      await (hooks["experimental.chat.system.transform"] as Function)(
        { sessionID: "test-session", model: { id: "test", providerID: "test" } },
        systemOutput
      )

      expect(systemOutput.system.length).toBe(1)
      expect(systemOutput.system[0]).toContain("System Skill Content")
    })

    it("does not inject into chat.message when using systemPrompt method", async () => {
      createSkill("sys-skill", "---\nname: sys-skill\ndescription: System\n---\nSystem Skill Content")
      createConfig({ skills: ["sys-skill"], injectionMethod: "systemPrompt" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const msgOutput = createMsgOutput("Hello")
      await (hooks["chat.message"] as Function)({ sessionID: "test-session" }, msgOutput)

      expect(msgOutput.parts[0]!.text).toBe("Hello")
    })

    it("system prompt injection handles missing sessionID", async () => {
      createSkill("sys-skill", "---\nname: sys-skill\ndescription: System\n---\nContent")
      createConfig({ skills: ["sys-skill"], injectionMethod: "systemPrompt" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      const systemOutput = { system: [] as string[] }
      await (hooks["experimental.chat.system.transform"] as Function)(
        { model: { id: "test", providerID: "test" } },
        systemOutput
      )

      expect(systemOutput.system.length).toBe(0)
    })

    it("system prompt includes triggered skills", async () => {
      createSkill("initial-skill", "---\nname: initial-skill\ndescription: Initial\n---\nInitial Content")
      createSkill("ts-skill", "---\nname: ts-skill\ndescription: TS\n---\nTypeScript Content")
      createConfig({
        skills: ["initial-skill"],
        fileTypeSkills: { ".ts": ["ts-skill"] },
        injectionMethod: "systemPrompt"
      })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      await (hooks["tool.execute.before"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { args: { filePath: "test.ts" } }
      )
      await (hooks["tool.execute.after"] as Function)(
        { tool: "read", sessionID: "test-session", callID: "call-1" },
        { title: "", output: "", metadata: {} }
      )

      const systemOutput = { system: [] as string[] }
      await (hooks["experimental.chat.system.transform"] as Function)(
        { sessionID: "test-session", model: { id: "test", providerID: "test" } },
        systemOutput
      )

      expect(systemOutput.system[0]).toContain("Initial Content")
      expect(systemOutput.system[0]).toContain("TypeScript Content")
    })

    it("parses injectionMethod from config correctly", async () => {
      createConfig({ injectionMethod: "systemPrompt" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks["experimental.chat.system.transform"]).toBeDefined()
    })

    it("falls back to default for invalid injectionMethod values", async () => {
      createConfig({ injectionMethod: "invalid" })

      const ctx = createMockContext()
      const hooks = await PreloadSkillsPlugin(ctx)

      expect(hooks["experimental.chat.system.transform"]).toBeDefined()
    })
  })
})
