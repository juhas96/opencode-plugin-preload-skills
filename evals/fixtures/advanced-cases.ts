import type { EvalCase, EvalSkill } from "../lib/types.js"

const asyncErrorSkill: EvalSkill = {
  name: "async-error-handling",
  content: `# Async Error Handling Rules

>>> CRITICAL: Follow this pattern exactly for all async functions <<<

RULE 1 - ALWAYS try/catch:
- >>> Wrap ALL db/fetch calls in try/catch <<<

RULE 2 - Return Result Objects:
- >>> Return { success: true, data: ... } on success <<<
- >>> Return { success: false, error: "..." } on failure <<<
- >>> NEVER throw - always return Result <<<

RULE 3 - ALWAYS Log Errors:
- >>> Use logger.error() before returning failure <<<
- NEVER use console.error()

Required pattern:
\`\`\`typescript
async function fetchUser(id: string) {
  try {
    const user = await db.findById(id)
    return { success: true, data: user }
  } catch (error) {
    logger.error('fetchUser failed', { id, error })
    return { success: false, error: 'Failed to fetch user' }
  }
}
\`\`\``,
  summary: "try/catch ALL async, return {success,data} or {success:false,error}, use logger.error()",
}

const multiStepValidationSkill: EvalSkill = {
  name: "multi-step-validation",
  content: `# Input Validation Pipeline

MANDATORY: All user input must pass through this exact validation pipeline:

STEP 1 - Sanitization:
- Trim whitespace from strings
- Remove null bytes
- Normalize unicode

STEP 2 - Type Coercion:
- Convert string numbers to numbers
- Convert string booleans to booleans
- Parse ISO dates to Date objects

STEP 3 - Schema Validation:
- Validate against expected schema
- Check required fields exist
- Validate field types match

STEP 4 - Business Rules:
- Apply domain-specific validation
- Check cross-field constraints
- Validate against external data if needed

STEP 5 - Error Aggregation:
- Collect ALL validation errors (don't fail fast)
- Return array of ValidationError objects
- Each error must have: field, rule, message

The pipeline must execute all 5 steps IN ORDER.`,
  summary: "5-step validation: sanitize, coerce, schema, business rules, aggregate errors",
}

const preciseNamingSkill: EvalSkill = {
  name: "precise-naming",
  content: `# Variable & Function Naming Rules

>>> CRITICAL: Follow these naming conventions exactly <<<

BOOLEANS - MUST start with:
- is* (isValid, isEnabled, isLoading)
- has* (hasPermission, hasError)
- can* (canEdit, canDelete)
- should* (shouldRefresh, shouldRetry)
- check* (checkPermission, checkValid)

ARRAYS - MUST be plural nouns:
- users, items, errors, products, filtered
- >>> NEVER: userList, itemArray, dataArray <<<

FUNCTIONS:
- Getters: get* (getUser, getValue)
- Setters: set* (setUser, setValue)  
- Validators: validate* or check* (validateEmail, checkPermission)
- Handlers: handle* or on* (handleClick, onSubmit)
- Async fetchers: fetch* or load* or filter* (fetchUser, loadData, filterProducts)

>>> FORBIDDEN - NEVER USE THESE: <<<
- data, info, item, thing, stuff (too generic)
- temp, tmp, foo, bar, x, y (unclear)`,
  summary: "Booleans: is/has/can/should/check. Arrays: plural. Functions: get/set/validate/handle/fetch/filter",
}

const defensiveCodingSkill: EvalSkill = {
  name: "defensive-coding",
  content: `# Defensive Coding Standards

>>> CRITICAL: Apply these rules to ALL functions <<<

RULE 1 - ALWAYS Check Inputs:
- >>> if (!param) or param === null/undefined check REQUIRED <<<
- Validate ALL function parameters at start
- Return [] for empty arrays early

RULE 2 - ALWAYS Use Defaults:
- >>> Use ?? (nullish coalescing) for optional params <<<
- Example: const limit = maxItems ?? 100

RULE 3 - ALWAYS Throw on Invalid:
- >>> throw new Error() for invalid state <<<
- Include what failed in error message

Example pattern:
\`\`\`typescript
function process(items: Item[] | null, limit?: number) {
  if (!items) throw new Error('items required')
  if (items.length === 0) return []
  const max = limit ?? 100
  return items.slice(0, max)
}
\`\`\``,
  summary: "Check inputs with if(!x), use ?? for defaults, throw Error on invalid, return [] for empty",
}

const unrelatedDatabaseSkill: EvalSkill = {
  name: "database-patterns",
  content: `# Database Access Patterns

MANDATORY: All database operations must follow these patterns.

CONNECTION POOLING:
- Always use connection pools, never single connections
- Pool size: min 5, max 20 connections
- Idle timeout: 30 seconds

QUERY PATTERNS:
- Use parameterized queries ONLY (never string concatenation)
- Always specify column names (no SELECT *)
- Use LIMIT on all queries that could return many rows

TRANSACTIONS:
- Wrap related operations in transactions
- Use savepoints for nested transactions
- Always rollback on error

MIGRATIONS:
- Use migration files for all schema changes
- Migrations must be reversible
- Test rollback before deploying`,
  summary: "Connection pools, parameterized queries, transactions, migrations",
}

const unrelatedUISkill: EvalSkill = {
  name: "ui-patterns",
  content: `# UI Component Patterns

MANDATORY: All UI components must follow these patterns.

COMPONENT STRUCTURE:
- One component per file
- Props interface defined above component
- Default exports for page components only

STATE MANAGEMENT:
- Local state for UI-only state
- Global state for shared data
- Derive state instead of syncing

ACCESSIBILITY:
- All interactive elements need aria labels
- Color contrast must meet WCAG AA
- Keyboard navigation required

PERFORMANCE:
- Memoize expensive computations
- Lazy load below-fold content
- Virtualize long lists`,
  summary: "Component structure, state management, a11y, performance",
}

const largeAPISkill: EvalSkill = {
  name: "comprehensive-api-design",
  content: `# Comprehensive REST API Design Guide

## 1. URL Structure

MANDATORY URL patterns:

### Resource Naming:
- Use plural nouns: /users, /orders, /products
- Use kebab-case: /order-items, /user-profiles
- Nest for relationships: /users/{id}/orders

### Query Parameters:
- Filtering: ?status=active&type=premium
- Sorting: ?sort=created_at&order=desc
- Pagination: ?page=1&limit=20 OR ?cursor=abc123
- Field selection: ?fields=id,name,email

### Path Parameters:
- IDs only in path: /users/{userId}
- Never include actions in URL: /users/{id}/activate (BAD)
- Use POST to /users/{id}/activations instead

## 2. HTTP Methods

MANDATORY method usage:

GET - Retrieve resources
- Must be idempotent
- Never modify state
- Return 200 with data or 404

POST - Create resources
- Request body contains new resource
- Return 201 with created resource
- Include Location header with new resource URL

PUT - Replace entire resource
- Request body is complete replacement
- Return 200 with updated resource
- Create if not exists (optional, return 201)

PATCH - Partial update
- Request body contains only changed fields
- Return 200 with updated resource
- Use JSON Patch or JSON Merge Patch format

DELETE - Remove resource
- Idempotent (multiple calls same result)
- Return 204 No Content on success
- Return 404 if already deleted (optional)

## 3. Response Format

MANDATORY response structure:

### Success Response:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "hasMore": true
    }
  }
}
\`\`\`

### Error Response:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123"
  }
}
\`\`\`

## 4. Status Codes

MANDATORY status code usage:

### 2xx Success:
- 200 OK: General success with body
- 201 Created: Resource created
- 204 No Content: Success without body

### 4xx Client Errors:
- 400 Bad Request: Malformed request syntax
- 401 Unauthorized: Authentication required
- 403 Forbidden: Authenticated but not authorized
- 404 Not Found: Resource doesn't exist
- 409 Conflict: Resource conflict (duplicate)
- 422 Unprocessable Entity: Validation failed
- 429 Too Many Requests: Rate limit exceeded

### 5xx Server Errors:
- 500 Internal Server Error: Unexpected error
- 502 Bad Gateway: Upstream service error
- 503 Service Unavailable: Temporary maintenance
- 504 Gateway Timeout: Upstream timeout

## 5. Authentication & Authorization

MANDATORY security patterns:

### Authentication:
- Use Bearer tokens in Authorization header
- Token format: Authorization: Bearer <jwt>
- Refresh tokens for long sessions
- Rotate tokens on sensitive operations

### Authorization:
- Check permissions AFTER authentication
- Use role-based access control (RBAC)
- Resource-level permissions for fine-grained control
- Audit all authorization decisions

## 6. Rate Limiting

MANDATORY rate limit headers:

\`\`\`
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248600
Retry-After: 60
\`\`\`

Strategies:
- Token bucket for API keys
- Sliding window for user sessions
- Different limits per endpoint criticality

## 7. Versioning

MANDATORY: Use URL versioning:
- /v1/users, /v2/users
- Never break existing versions
- Deprecate with 6-month warning
- Include Sunset header for deprecated endpoints

## 8. Documentation

MANDATORY documentation:
- OpenAPI 3.0 spec for all endpoints
- Example requests and responses
- Error code reference
- Authentication guide
- Rate limit documentation`,
  summary:
    "REST API: plural URLs, proper HTTP methods, {success,data,meta} format, correct status codes, Bearer auth, rate limits, URL versioning",
}

export const advancedEvalCases: EvalCase[] = [
  {
    id: "hard-001",
    description: "Follows async error handling with Result objects",
    type: "instruction-following",
    skill: asyncErrorSkill,
    prompt:
      "Write a TypeScript async function that fetches a user from a database and returns the result. Follow the async error handling rules.",
    assertions: [
      { type: "custom", name: "hasAsyncAwait" },
      { type: "custom", name: "hasErrorHandling" },
      { type: "contains", value: "success" },
      { type: "matches-pattern", pattern: "logger\\.error|logger\\.warn" },
      { type: "not-matches-pattern", pattern: "throw\\s+(new\\s+)?Error" },
    ],
    tags: ["hard", "error-handling"],
  },

  {
    id: "hard-002",
    description: "Implements all 5 validation steps in correct order",
    type: "instruction-following",
    skill: multiStepValidationSkill,
    prompt:
      "Write a TypeScript function that validates user registration input (email, password, age, referralCode). Implement the complete validation pipeline from the skill.",
    assertions: [
      { type: "contains", value: "trim" },
      { type: "matches-pattern", pattern: "parseInt|Number\\(" },
      { type: "contains", value: "ValidationError" },
      { type: "matches-pattern", pattern: "errors?\\.(push|concat|\\[)" },
      { type: "not-matches-pattern", pattern: "throw.*ValidationError" },
    ],
    tags: ["hard", "multi-step"],
  },

  {
    id: "hard-003",
    description: "Uses correct naming conventions throughout",
    type: "pattern-adherence",
    skill: preciseNamingSkill,
    prompt:
      "Write a TypeScript function that fetches users from an API, filters active ones, checks if each has admin permission, and returns the list. Use proper naming conventions.",
    assertions: [
      { type: "matches-pattern", pattern: "(is|has|can|should|check)[A-Z]\\w*" },
      { type: "matches-pattern", pattern: "users|admins|active|filtered" },
      { type: "matches-pattern", pattern: "(fetch|load|get|filter)[A-Z]\\w*" },
    ],
    tags: ["hard", "naming"],
  },

  {
    id: "hard-004",
    description: "Applies defensive coding rules",
    type: "pattern-adherence",
    skill: defensiveCodingSkill,
    prompt:
      "Write a TypeScript function that processes a batch of orders: takes an array of orders (nullable), a maxItems limit (optional), and returns processed orders. Apply defensive coding.",
    assertions: [
      { type: "matches-pattern", pattern: "if\\s*\\(\\s*!|===\\s*(null|undefined)" },
      { type: "matches-pattern", pattern: "\\?\\?|\\|\\||\\?" },
      { type: "matches-pattern", pattern: "throw|return\\s+\\[\\]" },
    ],
    tags: ["hard", "defensive"],
  },

  {
    id: "interference-001",
    description: "Follows target skill despite unrelated database skill present",
    type: "instruction-following",
    skill: preciseNamingSkill,
    prompt:
      "Write a function that validates an email address and returns whether it's valid. Focus on the naming conventions skill.",
    assertions: [
      { type: "matches-pattern", pattern: "(is|has|can|validate|check)[A-Z]\\w*" },
      { type: "not-matches-pattern", pattern: "\\b(data|info|tmp|temp|foo|bar)\\b" },
    ],
    tags: ["interference"],
  },

  {
    id: "large-001",
    description: "Follows large API design skill for response format",
    type: "api-correctness",
    skill: largeAPISkill,
    prompt:
      "Write a TypeScript Express route handler for GET /users/:id that returns a user by ID. Follow the API design guide.",
    assertions: [
      { type: "contains", value: "success" },
      { type: "contains", value: "data" },
      { type: "contains", value: "meta" },
      { type: "matches-pattern", pattern: "timestamp|requestId" },
      { type: "matches-pattern", pattern: "200|404" },
    ],
    tags: ["large-skill"],
  },

  {
    id: "large-002",
    description: "Uses correct HTTP methods per large API skill",
    type: "api-correctness",
    skill: largeAPISkill,
    prompt:
      "Write TypeScript Express route handlers for creating, updating (partial), and deleting a user resource. Follow the API design guide for methods and status codes.",
    assertions: [
      { type: "matches-pattern", pattern: "\\.post\\s*\\(" },
      { type: "matches-pattern", pattern: "\\.patch\\s*\\(" },
      { type: "matches-pattern", pattern: "\\.delete\\s*\\(" },
      { type: "matches-pattern", pattern: "201|204" },
    ],
    tags: ["large-skill"],
  },

  {
    id: "combined-001",
    description: "Combines defensive coding with API error format",
    type: "pattern-adherence",
    skill: {
      name: "combined-rules",
      content: `${defensiveCodingSkill.content}\n\n---\n\n${largeAPISkill.content}`,
      summary: "Defensive coding + REST API design",
    },
    prompt:
      "Write a TypeScript function that handles a POST request to create a user. Apply defensive coding to validate input and return proper API response format for both success and errors.",
    assertions: [
      { type: "matches-pattern", pattern: "if\\s*\\(\\s*!" },
      { type: "contains", value: "success" },
      { type: "contains", value: "error" },
      { type: "matches-pattern", pattern: "400|422" },
      { type: "matches-pattern", pattern: "201" },
    ],
    tags: ["combined", "hard"],
  },
]

export function createInterferenceCase(
  targetSkill: EvalSkill,
  distractorSkill: EvalSkill,
  evalCase: Omit<EvalCase, "skill">
): EvalCase {
  return {
    ...evalCase,
    skill: {
      name: `${targetSkill.name}+distractor`,
      content: `${targetSkill.content}\n\n---\n\nADDITIONAL CONTEXT (may or may not be relevant):\n\n${distractorSkill.content}`,
      summary: targetSkill.summary,
    },
  }
}

export const interferenceTestCases: EvalCase[] = [
  createInterferenceCase(preciseNamingSkill, unrelatedDatabaseSkill, {
    id: "interference-002",
    description: "Follows naming skill despite database skill distractor",
    type: "pattern-adherence",
    prompt:
      "Write a function to check if a user has admin permissions. Follow the naming conventions.",
    assertions: [
      { type: "matches-pattern", pattern: "(has|is|can|check)[A-Z]\\w*" },
    ],
    tags: ["interference"],
  }),

  createInterferenceCase(preciseNamingSkill, unrelatedUISkill, {
    id: "interference-003",
    description: "Follows naming skill despite UI skill distractor",
    type: "pattern-adherence",
    prompt: "Write a function to fetch and filter a list of products. Follow the naming conventions.",
    assertions: [
      { type: "matches-pattern", pattern: "products|items|filtered" },
      { type: "matches-pattern", pattern: "(fetch|load|get|filter)[A-Z]\\w*" },
    ],
    tags: ["interference"],
  }),
]

export const allAdvancedCases: EvalCase[] = [
  ...advancedEvalCases,
  ...interferenceTestCases,
]
