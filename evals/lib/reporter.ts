import type { EvalSuiteResult } from "./types.js"

export function generateMarkdownReport(result: EvalSuiteResult): string {
  const lines: string[] = []

  lines.push(`# Eval Report: ${result.name}`)
  lines.push("")
  lines.push(`**Run Date:** ${result.startedAt.toISOString()}`)
  lines.push(`**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`)
  lines.push(`**Total Cases:** ${result.summary.totalCases}`)
  lines.push(`**Total Runs:** ${result.summary.totalRuns}`)
  lines.push("")

  lines.push("## Summary")
  lines.push("")
  lines.push("| Configuration | Pass Rate | vs Baseline |")
  lines.push("|---------------|-----------|-------------|")

  for (const row of result.summary.comparisonTable) {
    const vsBaseline =
      row.vsBaseline === 0
        ? "—"
        : row.vsBaseline > 0
          ? `+${row.vsBaseline}pp`
          : `${row.vsBaseline}pp`
    lines.push(`| ${row.configuration} | ${row.passRate}% | ${vsBaseline} |`)
  }
  lines.push("")

  if (result.summary.variance) {
    const v = result.summary.variance
    lines.push("## Variance Analysis")
    lines.push("")
    lines.push(`- **Range:** ${v.min}% - ${v.max}%`)
    lines.push(`- **Mean:** ${v.mean}%`)
    lines.push(`- **Std Dev:** ${v.stdDev}`)
    lines.push(`- **Stability:** ${v.stable ? "✅ STABLE" : "⚠️ UNSTABLE (increase retries)"}`)
    lines.push("")
  }

  lines.push("## Breakdown by Eval Type")
  lines.push("")
  lines.push("| Configuration | Pattern | API | Instructions | Forbidden |")
  lines.push("|---------------|---------|-----|--------------|-----------|")

  for (const row of result.summary.comparisonTable) {
    lines.push(
      `| ${row.configuration} | ${row.breakdown.patternAdherence}% | ${row.breakdown.apiCorrectness}% | ${row.breakdown.instructionFollowing}% | ${row.breakdown.forbiddenAvoidance}% |`
    )
  }
  lines.push("")

  lines.push("## Detailed Results")
  lines.push("")

  for (const configResult of result.configResults) {
    lines.push(`### ${configResult.config.label}`)
    lines.push("")
    lines.push(`**Pass Rate:** ${configResult.passRate}%`)
    lines.push("")

    const failed = configResult.results.filter((r) => !r.passed)
    if (failed.length > 0) {
      lines.push("#### Failed Cases")
      lines.push("")
      for (const result of failed) {
        lines.push(`- **${result.evalCase.id}**: ${result.evalCase.description}`)
        lines.push(`  - Pass rate: ${Math.round(result.passRate * 100)}%`)
        const lastRun = result.runs[result.runs.length - 1]
        if (lastRun) {
          const failedAssertions = lastRun.assertionResults.filter((a) => !a.passed)
          for (const assertion of failedAssertions) {
            lines.push(`  - ${assertion.message}`)
          }
        }
      }
      lines.push("")
    }
  }

  return lines.join("\n")
}

export function generateJSONReport(result: EvalSuiteResult): string {
  return JSON.stringify(result, null, 2)
}

export function generateConsoleReport(result: EvalSuiteResult): void {
  console.log("\n" + "=".repeat(60))
  console.log(`EVAL REPORT: ${result.name}`)
  console.log("=".repeat(60))
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
  console.log(`Total Cases: ${result.summary.totalCases}`)
  console.log("")

  console.log("SUMMARY")
  console.log("-".repeat(60))
  console.log(
    padRight("Configuration", 30) + padRight("Pass Rate", 15) + padRight("vs Baseline", 15)
  )
  console.log("-".repeat(60))

  for (const row of result.summary.comparisonTable) {
    const vsBaseline =
      row.vsBaseline === 0
        ? "—"
        : row.vsBaseline > 0
          ? `+${row.vsBaseline}pp`
          : `${row.vsBaseline}pp`
    console.log(padRight(row.configuration, 30) + padRight(`${row.passRate}%`, 15) + vsBaseline)
  }
  console.log("")

  console.log("BREAKDOWN BY TYPE")
  console.log("-".repeat(60))
  console.log(
    padRight("Configuration", 20) +
      padRight("Pattern", 10) +
      padRight("API", 10) +
      padRight("Instruct", 10) +
      padRight("Forbid", 10)
  )
  console.log("-".repeat(60))

  for (const row of result.summary.comparisonTable) {
    console.log(
      padRight(row.configuration, 20) +
        padRight(`${row.breakdown.patternAdherence}%`, 10) +
        padRight(`${row.breakdown.apiCorrectness}%`, 10) +
        padRight(`${row.breakdown.instructionFollowing}%`, 10) +
        padRight(`${row.breakdown.forbiddenAvoidance}%`, 10)
    )
  }
  console.log("")

  const failures = result.configResults.flatMap((cr) =>
    cr.results.filter((r) => !r.passed).map((r) => ({ config: cr.config.label, result: r }))
  )

  if (result.summary.variance) {
    const v = result.summary.variance
    console.log("VARIANCE ANALYSIS")
    console.log("-".repeat(60))
    console.log(`Range: ${v.min}% - ${v.max}%`)
    console.log(`Mean: ${v.mean}%  |  Std Dev: ${v.stdDev}`)
    console.log(`Stability: ${v.stable ? "STABLE (low variance)" : "UNSTABLE (high variance - increase retries)"}`)
    console.log("")
  }

  if (failures.length > 0) {
    console.log(`FAILURES (${failures.length})`)
    console.log("-".repeat(60))
    for (const { config, result } of failures) {
      console.log(`[${config}] ${result.evalCase.id}: ${result.evalCase.description}`)
    }
  }

  console.log("=".repeat(60) + "\n")
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length)
}

export async function saveReport(
  result: EvalSuiteResult,
  outputPath: string,
  format: "markdown" | "json" = "markdown"
): Promise<void> {
  const { writeFileSync } = await import("node:fs")
  const content = format === "json" ? generateJSONReport(result) : generateMarkdownReport(result)
  writeFileSync(outputPath, content, "utf-8")
}
