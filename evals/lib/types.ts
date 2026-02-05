/**
 * Eval System Types
 *
 * Inspired by Vercel's agent evals for AGENTS.md
 * Measures both injection success and agent following rate
 */

export type EvalType =
  | "pattern-adherence" // Skill says "use X pattern", agent should use it
  | "api-correctness" // Skill documents API, agent should use correct syntax
  | "instruction-following" // Skill says "always do X", agent should do it
  | "forbidden-avoidance" // Skill says "never use X", agent should avoid it

export type InjectionMethod = "systemPrompt" | "chatMessage"

export type ModelProvider = "openai" | "anthropic"

export type MinificationLevel = "standard" | "aggressive"

export interface EvalConfig {
  provider: ModelProvider
  openaiApiKey?: string
  anthropicApiKey?: string
  model: string
  retries: number
  timeout: number
  parallel: boolean
  maxParallel: number
}

export interface EvalSkill {
  /** Skill name */
  name: string
  /** Skill content (what gets injected) */
  content: string
  /** Optional summary for summary mode testing */
  summary?: string
}

export interface EvalCase {
  /** Unique identifier for this eval case */
  id: string
  /** Human-readable description */
  description: string
  /** Type of evaluation */
  type: EvalType
  /** The skill being tested */
  skill: EvalSkill
  /** The prompt to send to the LLM */
  prompt: string
  /** Assertions to run on the response */
  assertions: EvalAssertion[]
  /** Tags for filtering/grouping */
  tags?: string[]
  /** Minimum fraction of assertions that must pass (0-1, default: 1.0 = all) */
  passThreshold?: number
}

export type EvalAssertion =
  | ContainsAssertion
  | NotContainsAssertion
  | MatchesPatternAssertion
  | NotMatchesPatternAssertion
  | ASTAssertion
  | CustomAssertion

export interface ContainsAssertion {
  type: "contains"
  /** Text that must be present in response */
  value: string
  /** Case-sensitive match (default: false) */
  caseSensitive?: boolean
}

export interface NotContainsAssertion {
  type: "not-contains"
  /** Text that must NOT be present in response */
  value: string
  /** Case-sensitive match (default: false) */
  caseSensitive?: boolean
}

export interface MatchesPatternAssertion {
  type: "matches-pattern"
  /** Regex pattern that must match somewhere in response */
  pattern: string
  /** Regex flags (default: "gm") */
  flags?: string
}

export interface NotMatchesPatternAssertion {
  type: "not-matches-pattern"
  /** Regex pattern that must NOT match anywhere in response */
  pattern: string
  /** Regex flags (default: "gm") */
  flags?: string
}

export interface ASTAssertion {
  type: "ast"
  /** Language for AST parsing */
  language: "typescript" | "javascript" | "python"
  /** AST-grep pattern to match */
  pattern: string
  /** Whether pattern should match (true) or not match (false) */
  shouldMatch: boolean
}

export interface CustomAssertion {
  type: "custom"
  /** Name of custom assertion function */
  name: string
  /** Arguments to pass to custom assertion */
  args?: Record<string, unknown>
}

export interface EvalResult {
  /** The eval case that was run */
  evalCase: EvalCase
  /** Configuration used for this run */
  config: EvalRunConfig
  /** Individual run results (multiple if retries > 1) */
  runs: EvalRunResult[]
  /** Aggregated pass rate across all runs */
  passRate: number
  /** Whether this eval passed (passRate >= threshold) */
  passed: boolean
}

export interface EvalRunConfig {
  injectionMethod: InjectionMethod
  useSummaries: boolean
  useMinification: boolean | MinificationLevel
  label: string
}

export interface EvalRunResult {
  /** Run attempt number (1-indexed) */
  attempt: number
  /** LLM response text */
  response: string
  /** Assertion results */
  assertionResults: AssertionResult[]
  /** Whether all assertions passed */
  passed: boolean
  /** Time taken in ms */
  durationMs: number
  /** Token usage */
  tokens?: {
    prompt: number
    completion: number
    total: number
  }
  /** Error if run failed */
  error?: string
}

export interface AssertionResult {
  /** The assertion that was run */
  assertion: EvalAssertion
  /** Whether assertion passed */
  passed: boolean
  /** Detailed message about why it passed/failed */
  message: string
}

export interface EvalSuiteResult {
  /** Suite name */
  name: string
  /** When the suite started */
  startedAt: Date
  /** When the suite finished */
  finishedAt: Date
  /** Total duration in ms */
  durationMs: number
  /** Results per configuration */
  configResults: ConfigResult[]
  /** Summary statistics */
  summary: EvalSummary
}

export interface ConfigResult {
  /** Configuration label */
  config: EvalRunConfig
  /** Results for this config */
  results: EvalResult[]
  /** Pass rate for this config */
  passRate: number
  /** Breakdown by eval type */
  byType: Record<EvalType, { passed: number; total: number; rate: number }>
}

export interface VarianceStats {
  min: number
  max: number
  mean: number
  stdDev: number
  stable: boolean
}

export interface EvalSummary {
  totalCases: number
  totalRuns: number
  overallPassRate: number
  comparisonTable: ComparisonRow[]
  variance?: VarianceStats
}

export interface ComparisonRow {
  /** Configuration label */
  configuration: string
  /** Overall pass rate */
  passRate: number
  /** Difference from baseline (percentage points) */
  vsBaseline: number
  /** Breakdown by eval type */
  breakdown: {
    patternAdherence: number
    apiCorrectness: number
    instructionFollowing: number
    forbiddenAvoidance: number
  }
}
