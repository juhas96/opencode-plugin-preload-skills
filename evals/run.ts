import { createRunner } from "./lib/runner.js"
import { generateConsoleReport, saveReport } from "./lib/reporter.js"
import { evalCases } from "./fixtures/cases.js"
import { allAdvancedCases } from "./fixtures/advanced-cases.js"
import type { EvalRunConfig, ModelProvider } from "./lib/types.js"

const configurations: EvalRunConfig[] = [
  {
    label: "baseline",
    injectionMethod: "systemPrompt",
    useSummaries: false,
    useMinification: false,
  },
  {
    label: "systemPrompt (full)",
    injectionMethod: "systemPrompt",
    useSummaries: false,
    useMinification: false,
  },
  {
    label: "systemPrompt (summary)",
    injectionMethod: "systemPrompt",
    useSummaries: true,
    useMinification: false,
  },
  {
    label: "systemPrompt (minified)",
    injectionMethod: "systemPrompt",
    useSummaries: false,
    useMinification: "standard",
  },
  {
    label: "systemPrompt (aggressive)",
    injectionMethod: "systemPrompt",
    useSummaries: false,
    useMinification: "aggressive",
  },
  {
    label: "chatMessage (full)",
    injectionMethod: "chatMessage",
    useSummaries: false,
    useMinification: false,
  },
]

function detectProvider(model: string): ModelProvider {
  if (model.startsWith("claude")) return "anthropic"
  return "openai"
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const flags = parseArgs(args)

  if (flags.help) {
    printHelp()
    process.exit(0)
  }

  const model = flags.model ?? process.env.EVAL_MODEL ?? "gpt-4o-mini"
  const provider = detectProvider(model)

  const apiKey =
    provider === "anthropic"
      ? flags.anthropicKey ?? process.env.ANTHROPIC_API_KEY
      : flags.openaiKey ?? process.env.OPENAI_API_KEY

  if (!apiKey) {
    const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
    console.error(`Error: ${keyName} is required for model ${model}`)
    console.error(`Set it via environment variable or --${provider === "anthropic" ? "anthropic" : "openai"}-key flag`)
    process.exit(1)
  }

  const selectedConfigs = flags.configs
    ? configurations.filter((c) => flags.configs!.includes(c.label))
    : configurations

  if (selectedConfigs.length === 0) {
    console.error("Error: No valid configurations selected")
    console.error("Available:", configurations.map((c) => c.label).join(", "))
    process.exit(1)
  }

  const baseCases = flags.advanced ? [...evalCases, ...allAdvancedCases] : evalCases

  const selectedCases = flags.filter
    ? baseCases.filter(
        (c) =>
          c.id.includes(flags.filter!) ||
          c.type.includes(flags.filter!) ||
          c.description.toLowerCase().includes(flags.filter!.toLowerCase()) ||
          c.tags?.some((t) => t.includes(flags.filter!))
      )
    : baseCases

  if (selectedCases.length === 0) {
    console.error("Error: No eval cases match filter:", flags.filter)
    process.exit(1)
  }

  console.log(`\nRunning ${selectedCases.length} eval cases across ${selectedConfigs.length} configurations`)
  console.log(`Model: ${model} (${provider})`)
  console.log(`Retries: ${flags.retries ?? 3}`)
  if (flags.advanced) console.log(`Suite: ADVANCED (harder cases + interference tests)`)
  console.log("")

  const runner = createRunner({
    provider,
    openaiApiKey: provider === "openai" ? apiKey : undefined,
    anthropicApiKey: provider === "anthropic" ? apiKey : undefined,
    model,
    retries: flags.retries ?? 3,
    parallel: !flags.sequential,
  })

  try {
    const suiteName = flags.advanced ? "Advanced Skill Evals" : "Skill Injection Evals"
    const result = await runner.runSuite(suiteName, selectedCases, selectedConfigs)

    generateConsoleReport(result)

    if (flags.output) {
      const format = flags.output.endsWith(".json") ? "json" : "markdown"
      await saveReport(result, flags.output, format)
      console.log(`Report saved to: ${flags.output}`)
    }

    const exitCode = result.summary.overallPassRate >= (flags.threshold ?? 70) ? 0 : 1
    process.exit(exitCode)
  } catch (error) {
    console.error("Eval run failed:", error)
    process.exit(1)
  }
}

interface ParsedFlags {
  help?: boolean
  openaiKey?: string
  anthropicKey?: string
  model?: string
  retries?: number
  configs?: string[]
  filter?: string
  output?: string
  sequential?: boolean
  threshold?: number
  advanced?: boolean
}

function parseArgs(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!

    if (arg === "--help" || arg === "-h") {
      flags.help = true
    } else if (arg === "--openai-key" && args[i + 1]) {
      flags.openaiKey = args[++i]
    } else if (arg === "--anthropic-key" && args[i + 1]) {
      flags.anthropicKey = args[++i]
    } else if (arg === "--model" && args[i + 1]) {
      flags.model = args[++i]
    } else if (arg === "--retries" && args[i + 1]) {
      flags.retries = parseInt(args[++i]!, 10)
    } else if (arg === "--configs" && args[i + 1]) {
      flags.configs = args[++i]!.split(",")
    } else if (arg === "--filter" && args[i + 1]) {
      flags.filter = args[++i]
    } else if (arg === "--output" && args[i + 1]) {
      flags.output = args[++i]
    } else if (arg === "--sequential") {
      flags.sequential = true
    } else if (arg === "--threshold" && args[i + 1]) {
      flags.threshold = parseInt(args[++i]!, 10)
    } else if (arg === "--advanced") {
      flags.advanced = true
    }
  }

  return flags
}

function printHelp(): void {
  console.log(`
Skill Injection Evals

Usage: npx tsx evals/run.ts [options]

Options:
  --help, -h            Show this help message
  --openai-key KEY      OpenAI API key (or set OPENAI_API_KEY env)
  --anthropic-key KEY   Anthropic API key (or set ANTHROPIC_API_KEY env)
  --model MODEL         Model to use (default: gpt-4o-mini)
                        OpenAI: gpt-4o-mini, gpt-4o, gpt-4-turbo
                        Anthropic: claude-3-5-sonnet-20241022, claude-3-haiku-20240307
  --retries N           Number of retries per case (default: 3)
  --configs LIST        Comma-separated config labels to run
  --filter TERM         Filter cases by id, type, description, or tag
  --output PATH         Save report to file (.md or .json)
  --sequential          Run evals sequentially instead of parallel
  --threshold N         Pass threshold percentage (default: 70)
  --advanced            Include advanced test cases (harder + interference)

Available configurations:
  - baseline                  No skill injection
  - systemPrompt (full)       Full skill in system prompt
  - systemPrompt (summary)    Skill summary in system prompt  
  - systemPrompt (minified)   Standard minification (removes comments, whitespace)
  - systemPrompt (aggressive) Vercel-style aggressive minification (pipe-delimited)
  - chatMessage (full)        Full skill in chat message

Eval types:
  - pattern-adherence       Does agent follow code patterns?
  - api-correctness         Does agent use correct API format?
  - instruction-following   Does agent follow explicit instructions?
  - forbidden-avoidance     Does agent avoid forbidden patterns?

Advanced test tags (use with --filter):
  - hard                    Conflicting rules, multi-step reasoning
  - interference            Multi-skill distraction tests
  - large-skill             Tests with 2000+ token skills
  - combined                Multiple patterns combined

Examples:
  # Basic eval with OpenAI
  npx tsx evals/run.ts

  # Advanced eval with more retries for variance analysis
  npx tsx evals/run.ts --advanced --retries 5

  # Test with Anthropic Claude
  npx tsx evals/run.ts --model claude-3-5-sonnet-20241022

  # Filter to hard cases only
  npx tsx evals/run.ts --advanced --filter hard

  # Compare specific configs
  npx tsx evals/run.ts --configs "baseline,systemPrompt (full)"

  # Full run with report
  npx tsx evals/run.ts --advanced --retries 5 --output report.md
`)
}

main()
