import type { EvalCase, EvalSkill } from "../lib/types.js"

const asyncAwaitSkill: EvalSkill = {
  name: "async-patterns",
  content: `# Async/Await Patterns

MANDATORY: Always use async/await syntax for asynchronous operations.

Rules:
1. NEVER use .then()/.catch() chains - ALWAYS use async/await
2. ALWAYS wrap async calls in try/catch for error handling
3. Use Promise.all() for parallel operations

Example:
\`\`\`typescript
async function fetchData(url: string): Promise<Data> {
  try {
    const response = await fetch(url)
    return await response.json()
  } catch (error) {
    throw new Error(\`Failed to fetch: \${error}\`)
  }
}
\`\`\``,
  summary: "Use async/await, never .then()/.catch(), always try/catch",
}

const typeAnnotationsSkill: EvalSkill = {
  name: "typescript-strict",
  content: `# TypeScript Strict Mode Patterns

MANDATORY: Always use explicit type annotations.

Rules:
1. NEVER use 'any' type - use 'unknown' and narrow with type guards
2. ALWAYS annotate function parameters and return types
3. ALWAYS annotate variable declarations for non-primitive types
4. Use generics instead of 'any' for reusable code

Bad:
\`\`\`typescript
function process(data: any) { ... }
const result = getValue()
\`\`\`

Good:
\`\`\`typescript
function process<T extends Record<string, unknown>>(data: T): ProcessedResult { ... }
const result: UserData = getValue()
\`\`\``,
  summary: "No 'any', explicit types on functions and complex variables",
}

const noConsoleSkill: EvalSkill = {
  name: "production-logging",
  content: `# Production Logging Standards

FORBIDDEN: console.log, console.warn, console.error

Rules:
1. NEVER use console.* methods in production code
2. Use a proper logger instance instead
3. Logger must support log levels: debug, info, warn, error

Replace:
- console.log() -> logger.info()
- console.warn() -> logger.warn()
- console.error() -> logger.error()
- console.debug() -> logger.debug()

Example:
\`\`\`typescript
import { logger } from './logger'

function processUser(user: User): void {
  logger.info('Processing user', { userId: user.id })
  // NOT: console.log('Processing user', user.id)
}
\`\`\``,
  summary: "No console.*, use logger.info/warn/error instead",
}

const errorHandlingSkill: EvalSkill = {
  name: "error-handling",
  content: `# Error Handling Patterns

MANDATORY: Proper error handling for all external operations.

Rules:
1. ALWAYS use try/catch for async operations
2. NEVER have empty catch blocks - always handle or rethrow
3. Create custom error classes for different error types
4. Include context in error messages

Example:
\`\`\`typescript
class ValidationError extends Error {
  constructor(field: string, message: string) {
    super(\`Validation failed for \${field}: \${message}\`)
    this.name = 'ValidationError'
  }
}

async function saveUser(user: User): Promise<void> {
  try {
    await db.users.insert(user)
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw new ValidationError('user', 'Database constraint violation')
    }
    throw error
  }
}
\`\`\``,
  summary: "try/catch for async, no empty catches, custom error classes",
}

const namedExportsSkill: EvalSkill = {
  name: "module-exports",
  content: `# Module Export Patterns

MANDATORY: Use named exports, avoid default exports.

Rules:
1. ALWAYS use named exports: export function, export const, export class
2. NEVER use default exports
3. Re-export from index files using named exports

Bad:
\`\`\`typescript
export default function processData() { ... }
export default class UserService { ... }
\`\`\`

Good:
\`\`\`typescript
export function processData(): void { ... }
export class UserService { ... }
export const CONFIG = { ... }
\`\`\``,
  summary: "Named exports only, no default exports",
}

const apiResponseSkill: EvalSkill = {
  name: "api-response-format",
  content: `# API Response Format

MANDATORY: All API responses must follow this structure.

Response format:
\`\`\`typescript
interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  timestamp: string
}
\`\`\`

Rules:
1. ALWAYS return ApiResponse wrapper
2. Set success: true and data when operation succeeds
3. Set success: false and error message when operation fails
4. ALWAYS include ISO timestamp

Example:
\`\`\`typescript
function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString()
  }
}
\`\`\``,
  summary: "Wrap responses in {success, data, error, timestamp}",
}

export const evalCases: EvalCase[] = [
  {
    id: "pattern-001",
    description: "Uses async/await instead of .then() chains",
    type: "pattern-adherence",
    skill: asyncAwaitSkill,
    prompt:
      "Write a TypeScript function that fetches user data from an API endpoint and returns the parsed JSON. The function should handle errors appropriately.",
    assertions: [
      { type: "contains", value: "async" },
      { type: "contains", value: "await" },
      { type: "not-matches-pattern", pattern: "\\.then\\s*\\(" },
      { type: "custom", name: "hasErrorHandling" },
    ],
  },

  {
    id: "pattern-002",
    description: "Uses proper type annotations, no any",
    type: "pattern-adherence",
    skill: typeAnnotationsSkill,
    prompt:
      "Write a TypeScript function that takes a configuration object and returns a processed result. The config has name (string), options (array of strings), and enabled (boolean).",
    assertions: [
      { type: "custom", name: "hasTypeAnnotations" },
      { type: "custom", name: "noAnyType" },
      { type: "matches-pattern", pattern: ":\\s*(string|number|boolean|\\w+\\[\\]|Record<|{)" },
    ],
  },

  {
    id: "api-001",
    description: "Returns correct ApiResponse format",
    type: "api-correctness",
    skill: apiResponseSkill,
    prompt:
      "Write a TypeScript function that creates a user and returns an API response. The function should handle both success and error cases.",
    assertions: [
      { type: "contains", value: "success" },
      { type: "contains", value: "data" },
      { type: "contains", value: "error" },
      { type: "contains", value: "timestamp" },
      { type: "matches-pattern", pattern: "toISOString\\(\\)" },
    ],
  },

  {
    id: "api-002",
    description: "Uses named exports per skill instructions",
    type: "api-correctness",
    skill: namedExportsSkill,
    prompt:
      "Write a TypeScript module with a UserService class and a helper function called validateEmail. Export everything that should be public.",
    assertions: [
      { type: "custom", name: "usesNamedExports" },
      { type: "not-matches-pattern", pattern: "export\\s+default" },
    ],
  },

  {
    id: "instruction-001",
    description: "Adds try/catch with meaningful error handling",
    type: "instruction-following",
    skill: errorHandlingSkill,
    prompt:
      "Write a TypeScript function that saves data to a database. The function should properly handle any errors that might occur.",
    assertions: [
      { type: "contains", value: "try" },
      { type: "contains", value: "catch" },
      { type: "not-matches-pattern", pattern: "catch\\s*\\([^)]*\\)\\s*{\\s*}" },
      { type: "matches-pattern", pattern: "throw|logger|console" },
    ],
  },

  {
    id: "instruction-002",
    description: "Uses async/await with try/catch per instructions",
    type: "instruction-following",
    skill: asyncAwaitSkill,
    prompt:
      "Write a function that makes two parallel API calls and combines the results.",
    assertions: [
      { type: "contains", value: "async" },
      { type: "contains", value: "await" },
      { type: "contains", value: "Promise.all" },
      { type: "contains", value: "try" },
      { type: "contains", value: "catch" },
    ],
  },

  {
    id: "forbidden-001",
    description: "Avoids console.log, uses logger instead",
    type: "forbidden-avoidance",
    skill: noConsoleSkill,
    prompt:
      "Write a TypeScript function that processes an order and logs the progress at each step. Include logging for when the order starts, when payment is processed, and when the order completes.",
    assertions: [
      { type: "custom", name: "noConsoleLog" },
      { type: "matches-pattern", pattern: "logger\\.(info|warn|error|debug)" },
    ],
  },

  {
    id: "forbidden-002",
    description: "Avoids 'any' type per TypeScript strict rules",
    type: "forbidden-avoidance",
    skill: typeAnnotationsSkill,
    prompt:
      "Write a generic TypeScript function that can merge two objects of any shape and return the combined result.",
    assertions: [
      { type: "custom", name: "noAnyType" },
      { type: "matches-pattern", pattern: "<[A-Z]" },
    ],
  },

  {
    id: "forbidden-003",
    description: "Avoids default exports",
    type: "forbidden-avoidance",
    skill: namedExportsSkill,
    prompt:
      "Create a TypeScript module with a main function and two helper functions. Export everything that consumers might need.",
    assertions: [
      { type: "not-matches-pattern", pattern: "export\\s+default" },
      { type: "custom", name: "usesNamedExports" },
    ],
  },

  {
    id: "pattern-003",
    description: "Follows error handling pattern with custom errors",
    type: "pattern-adherence",
    skill: errorHandlingSkill,
    prompt:
      "Write a TypeScript function that validates user input (email and password) and throws appropriate errors for invalid data.",
    assertions: [
      { type: "matches-pattern", pattern: "class\\s+\\w*Error\\s+extends\\s+Error" },
      { type: "contains", value: "throw" },
      { type: "matches-pattern", pattern: "new\\s+\\w*Error\\(" },
    ],
  },
]
