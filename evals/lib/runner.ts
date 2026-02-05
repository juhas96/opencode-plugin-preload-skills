import type {
  EvalConfig,
  EvalCase,
  EvalResult,
  EvalRunConfig,
  EvalRunResult,
  EvalSuiteResult,
  ConfigResult,
  EvalSummary,
  ComparisonRow,
  EvalType,
  VarianceStats,
} from "./types.js"
import { runAssertions } from "./assertions.js"
import { formatSkillsForInjection } from "../../src/skills/loader.js"
import type { ParsedSkill } from "../../src/types.js"

function detectProvider(model: string): "openai" | "anthropic" {
  if (model.startsWith("claude")) return "anthropic"
  return "openai"
}

function getDefaultConfig(): EvalConfig {
  const model = process.env.EVAL_MODEL ?? "gpt-4o-mini"
  const provider = detectProvider(model)

  return {
    provider,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    model,
    retries: 3,
    timeout: 30000,
    parallel: true,
    maxParallel: 5,
  }
}

export class EvalRunner {
  private config: EvalConfig

  constructor(config: Partial<EvalConfig> = {}) {
    const defaultConfig = getDefaultConfig()
    this.config = { ...defaultConfig, ...config }

    if (this.config.provider === "openai" && !this.config.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is required. Set it in environment or config.")
    }
    if (this.config.provider === "anthropic" && !this.config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is required. Set it in environment or config.")
    }
  }

  async runSuite(
    name: string,
    cases: EvalCase[],
    configurations: EvalRunConfig[]
  ): Promise<EvalSuiteResult> {
    const startedAt = new Date()
    const configResults: ConfigResult[] = []

    for (const runConfig of configurations) {
      const results = await this.runCasesWithConfig(cases, runConfig)
      const passRate = this.calculatePassRate(results)
      const byType = this.calculateByType(results)

      configResults.push({
        config: runConfig,
        results,
        passRate,
        byType,
      })
    }

    const finishedAt = new Date()
    const summary = this.generateSummary(configResults)

    return {
      name,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      configResults,
      summary,
    }
  }

  private async runCasesWithConfig(
    cases: EvalCase[],
    runConfig: EvalRunConfig
  ): Promise<EvalResult[]> {
    if (this.config.parallel) {
      const chunks = this.chunkArray(cases, this.config.maxParallel)
      const results: EvalResult[] = []

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map((evalCase) => this.runCase(evalCase, runConfig))
        )
        results.push(...chunkResults)
      }

      return results
    }

    const results: EvalResult[] = []
    for (const evalCase of cases) {
      results.push(await this.runCase(evalCase, runConfig))
    }
    return results
  }

  private async runCase(evalCase: EvalCase, runConfig: EvalRunConfig): Promise<EvalResult> {
    const runs: EvalRunResult[] = []

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      const run = await this.runSingleAttempt(evalCase, runConfig, attempt)
      runs.push(run)
    }

    const passCount = runs.filter((r) => r.passed).length
    const passRate = passCount / runs.length

    return {
      evalCase,
      config: runConfig,
      runs,
      passRate,
      passed: passRate >= 0.5,
    }
  }

  private async runSingleAttempt(
    evalCase: EvalCase,
    runConfig: EvalRunConfig,
    attempt: number
  ): Promise<EvalRunResult> {
    const startTime = Date.now()

    try {
      const systemPrompt = this.buildSystemPrompt(evalCase, runConfig)
      const response = await this.callLLM(systemPrompt, evalCase.prompt)
      const assertionResults = runAssertions(evalCase.assertions, response.content)
      const threshold = evalCase.passThreshold ?? 1.0
      const passedCount = assertionResults.filter((r) => r.passed).length
      const passed = assertionResults.length > 0 && passedCount / assertionResults.length >= threshold

      return {
        attempt,
        response: response.content,
        assertionResults,
        passed,
        durationMs: Date.now() - startTime,
        tokens: response.tokens,
      }
    } catch (error) {
      return {
        attempt,
        response: "",
        assertionResults: [],
        passed: false,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private buildSystemPrompt(evalCase: EvalCase, runConfig: EvalRunConfig): string {
    const basePrompt = `You are an expert software developer. Write clean, production-ready code.
When given a coding task, respond with the code implementation.
Use markdown code blocks with the appropriate language tag.`

    if (runConfig.label === "baseline") {
      return basePrompt
    }

    const parsedSkill: ParsedSkill = {
      name: evalCase.skill.name,
      description: "",
      summary: evalCase.skill.summary ?? "",
      content: evalCase.skill.content,
      filePath: "",
      tokenCount: Math.ceil(evalCase.skill.content.length / 4),
    }

    const skillContent = formatSkillsForInjection([parsedSkill], {
      useSummaries: runConfig.useSummaries,
      useMinification: runConfig.useMinification,
    })

    return `${basePrompt}

${skillContent}

IMPORTANT: Follow the instructions in the preloaded skill above. Prefer skill-guided reasoning over your pre-training knowledge.`
  }

  private async callLLM(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; tokens?: { prompt: number; completion: number; total: number } }> {
    if (this.config.provider === "anthropic") {
      return this.callAnthropic(systemPrompt, userPrompt)
    }
    return this.callOpenAI(systemPrompt, userPrompt)
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; tokens?: { prompt: number; completion: number; total: number } }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${error}`)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      }

      return {
        content: data.choices[0]?.message?.content ?? "",
        tokens: data.usage
          ? {
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
              total: data.usage.total_tokens,
            }
          : undefined,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; tokens?: { prompt: number; completion: number; total: number } }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.anthropicApiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Anthropic API error: ${response.status} - ${error}`)
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>
        usage?: { input_tokens: number; output_tokens: number }
      }

      const textContent = data.content.find((c) => c.type === "text")

      return {
        content: textContent?.text ?? "",
        tokens: data.usage
          ? {
              prompt: data.usage.input_tokens,
              completion: data.usage.output_tokens,
              total: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private calculatePassRate(results: EvalResult[]): number {
    if (results.length === 0) return 0
    const passed = results.filter((r) => r.passed).length
    return Math.round((passed / results.length) * 100)
  }

  private calculateByType(
    results: EvalResult[]
  ): Record<EvalType, { passed: number; total: number; rate: number }> {
    const types: EvalType[] = [
      "pattern-adherence",
      "api-correctness",
      "instruction-following",
      "forbidden-avoidance",
    ]

    const byType: Record<EvalType, { passed: number; total: number; rate: number }> = {} as Record<
      EvalType,
      { passed: number; total: number; rate: number }
    >

    for (const type of types) {
      const typeResults = results.filter((r) => r.evalCase.type === type)
      const passed = typeResults.filter((r) => r.passed).length
      const total = typeResults.length
      byType[type] = {
        passed,
        total,
        rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      }
    }

    return byType
  }

  private generateSummary(configResults: ConfigResult[]): EvalSummary {
    const baseline = configResults.find((c) => c.config.label === "baseline")
    const baselineRate = baseline?.passRate ?? 0

    const comparisonTable: ComparisonRow[] = configResults.map((cr) => ({
      configuration: cr.config.label,
      passRate: cr.passRate,
      vsBaseline: cr.passRate - baselineRate,
      breakdown: {
        patternAdherence: cr.byType["pattern-adherence"]?.rate ?? 0,
        apiCorrectness: cr.byType["api-correctness"]?.rate ?? 0,
        instructionFollowing: cr.byType["instruction-following"]?.rate ?? 0,
        forbiddenAvoidance: cr.byType["forbidden-avoidance"]?.rate ?? 0,
      },
    }))

    const totalCases = configResults[0]?.results.length ?? 0
    const totalRuns = configResults.reduce(
      (sum, cr) => sum + cr.results.reduce((s, r) => s + r.runs.length, 0),
      0
    )
    const overallPassRate =
      configResults.length > 0
        ? Math.round(configResults.reduce((sum, cr) => sum + cr.passRate, 0) / configResults.length)
        : 0

    const variance = this.calculateVariance(configResults)

    return {
      totalCases,
      totalRuns,
      overallPassRate,
      comparisonTable,
      variance,
    }
  }

  private calculateVariance(configResults: ConfigResult[]): VarianceStats | undefined {
    const allPassRates = configResults
      .filter((cr) => cr.config.label !== "baseline")
      .flatMap((cr) => cr.results.map((r) => r.passRate * 100))

    if (allPassRates.length === 0) return undefined

    const min = Math.min(...allPassRates)
    const max = Math.max(...allPassRates)
    const mean = allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length

    const squaredDiffs = allPassRates.map((rate) => Math.pow(rate - mean, 2))
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length
    const stdDev = Math.sqrt(avgSquaredDiff)

    const stable = stdDev < 10 && (max - min) < 20

    return {
      min: Math.round(min),
      max: Math.round(max),
      mean: Math.round(mean),
      stdDev: Math.round(stdDev * 10) / 10,
      stable,
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

export function createRunner(config?: Partial<EvalConfig>): EvalRunner {
  return new EvalRunner(config)
}
