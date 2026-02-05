import type {
  EvalAssertion,
  AssertionResult,
  ContainsAssertion,
  NotContainsAssertion,
  MatchesPatternAssertion,
  NotMatchesPatternAssertion,
  ASTAssertion,
  CustomAssertion,
} from "./types.js"

export function runAssertion(assertion: EvalAssertion, response: string): AssertionResult {
  switch (assertion.type) {
    case "contains":
      return runContainsAssertion(assertion, response)
    case "not-contains":
      return runNotContainsAssertion(assertion, response)
    case "matches-pattern":
      return runMatchesPatternAssertion(assertion, response)
    case "not-matches-pattern":
      return runNotMatchesPatternAssertion(assertion, response)
    case "ast":
      return runASTAssertion(assertion, response)
    case "custom":
      return runCustomAssertion(assertion, response)
    default:
      return {
        assertion,
        passed: false,
        message: `Unknown assertion type: ${(assertion as EvalAssertion).type}`,
      }
  }
}

export function runAssertions(assertions: EvalAssertion[], response: string): AssertionResult[] {
  return assertions.map((assertion) => runAssertion(assertion, response))
}

function runContainsAssertion(assertion: ContainsAssertion, response: string): AssertionResult {
  const searchText = assertion.caseSensitive ? assertion.value : assertion.value.toLowerCase()
  const searchIn = assertion.caseSensitive ? response : response.toLowerCase()
  const passed = searchIn.includes(searchText)

  return {
    assertion,
    passed,
    message: passed
      ? `Found "${assertion.value}" in response`
      : `Expected response to contain "${assertion.value}"`,
  }
}

function runNotContainsAssertion(
  assertion: NotContainsAssertion,
  response: string
): AssertionResult {
  const searchText = assertion.caseSensitive ? assertion.value : assertion.value.toLowerCase()
  const searchIn = assertion.caseSensitive ? response : response.toLowerCase()
  const passed = !searchIn.includes(searchText)

  return {
    assertion,
    passed,
    message: passed
      ? `Correctly avoided "${assertion.value}" in response`
      : `Expected response to NOT contain "${assertion.value}"`,
  }
}

function runMatchesPatternAssertion(
  assertion: MatchesPatternAssertion,
  response: string
): AssertionResult {
  const regex = new RegExp(assertion.pattern, assertion.flags ?? "gm")
  const passed = regex.test(response)

  return {
    assertion,
    passed,
    message: passed
      ? `Pattern /${assertion.pattern}/ matched in response`
      : `Expected response to match pattern /${assertion.pattern}/`,
  }
}

function runNotMatchesPatternAssertion(
  assertion: NotMatchesPatternAssertion,
  response: string
): AssertionResult {
  const regex = new RegExp(assertion.pattern, assertion.flags ?? "gm")
  const passed = !regex.test(response)

  return {
    assertion,
    passed,
    message: passed
      ? `Correctly avoided pattern /${assertion.pattern}/ in response`
      : `Expected response to NOT match pattern /${assertion.pattern}/`,
  }
}

function runASTAssertion(assertion: ASTAssertion, response: string): AssertionResult {
  const codeBlock = extractCodeBlock(response, assertion.language)

  if (!codeBlock) {
    return {
      assertion,
      passed: !assertion.shouldMatch,
      message: assertion.shouldMatch
        ? `No ${assertion.language} code block found in response`
        : `No code block to check (correctly avoided pattern)`,
    }
  }

  const matches = matchASTPattern(codeBlock, assertion.pattern, assertion.language)

  const passed = assertion.shouldMatch ? matches : !matches

  return {
    assertion,
    passed,
    message: passed
      ? assertion.shouldMatch
        ? `AST pattern "${assertion.pattern}" found in code`
        : `AST pattern "${assertion.pattern}" correctly avoided`
      : assertion.shouldMatch
        ? `Expected AST pattern "${assertion.pattern}" in code`
        : `Found forbidden AST pattern "${assertion.pattern}" in code`,
  }
}

function extractCodeBlock(
  response: string,
  language: "typescript" | "javascript" | "python"
): string | null {
  const langAliases: Record<string, string[]> = {
    typescript: ["typescript", "ts", "tsx"],
    javascript: ["javascript", "js", "jsx"],
    python: ["python", "py"],
  }

  const aliases = langAliases[language] ?? [language]
  const pattern = new RegExp(`\`\`\`(?:${aliases.join("|")})\\s*\\n([\\s\\S]*?)\`\`\``, "i")
  const match = response.match(pattern)

  if (match) return match[1]?.trim() ?? null

  const genericPattern = /```\s*\n([\s\S]*?)```/
  const genericMatch = response.match(genericPattern)
  return genericMatch ? genericMatch[1]?.trim() ?? null : null
}

function matchASTPattern(
  code: string,
  pattern: string,
  _language: "typescript" | "javascript" | "python"
): boolean {
  const normalizedCode = code.replace(/\s+/g, " ").trim()
  const normalizedPattern = pattern.replace(/\s+/g, " ").trim()

  if (normalizedCode.includes(normalizedPattern)) return true

  const patternRegex = pattern
    .replace(/\$\w+/g, "[\\w\\d_]+")
    .replace(/\$\$\$/g, "[\\s\\S]*?")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*")

  return new RegExp(patternRegex).test(code)
}

const customAssertions: Record<
  string,
  (response: string, args?: Record<string, unknown>) => boolean
> = {
  hasAsyncAwait: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return /\basync\b/.test(code) && /\bawait\b/.test(code)
  },

  hasErrorHandling: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return /\btry\s*{/.test(code) && /\bcatch\s*\(/.test(code)
  },

  hasTypeAnnotations: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return /:\s*(string|number|boolean|any|\w+\[\]|Promise<|Record<|Array<)/.test(code)
  },

  hasComments: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return /\/\/|\/\*/.test(code)
  },

  noConsoleLog: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return !/console\.log\s*\(/.test(code)
  },

  noAnyType: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return !/:\s*any\b/.test(code) && !/<any>/.test(code) && !/as\s+any\b/.test(code)
  },

  usesNamedExports: (response) => {
    const code = extractCodeBlock(response, "typescript") ?? response
    return /export\s+(const|function|class|type|interface)\s+\w+/.test(code)
  },

  minLineCount: (response, args) => {
    const minLines = (args?.minLines as number) ?? 5
    const code = extractCodeBlock(response, "typescript") ?? response
    return code.split("\n").length >= minLines
  },
}

function runCustomAssertion(assertion: CustomAssertion, response: string): AssertionResult {
  const fn = customAssertions[assertion.name]

  if (!fn) {
    return {
      assertion,
      passed: false,
      message: `Unknown custom assertion: ${assertion.name}`,
    }
  }

  const passed = fn(response, assertion.args)

  return {
    assertion,
    passed,
    message: passed
      ? `Custom assertion "${assertion.name}" passed`
      : `Custom assertion "${assertion.name}" failed`,
  }
}

export function registerCustomAssertion(
  name: string,
  fn: (response: string, args?: Record<string, unknown>) => boolean
): void {
  customAssertions[name] = fn
}
