# Eval Report: Advanced Skill Evals

**Run Date:** 2026-02-05T12:31:43.739Z
**Duration:** 1510.9s
**Total Cases:** 20
**Total Runs:** 600

## Summary

| Configuration | Pass Rate | vs Baseline |
|---------------|-----------|-------------|
| baseline | 55% | — |
| systemPrompt (full) | 100% | +45pp |
| systemPrompt (summary) | 95% | +40pp |
| systemPrompt (minified) | 100% | +45pp |
| systemPrompt (aggressive) | 100% | +45pp |
| chatMessage (full) | 100% | +45pp |

## Variance Analysis

- **Range:** 20% - 100%
- **Mean:** 99%
- **Std Dev:** 8.4
- **Stability:** ⚠️ UNSTABLE (increase retries)

## Breakdown by Eval Type

| Configuration | Pattern | API | Instructions | Forbidden |
|---------------|---------|-----|--------------|-----------|
| baseline | 75% | 50% | 20% | 67% |
| systemPrompt (full) | 100% | 100% | 100% | 100% |
| systemPrompt (summary) | 88% | 100% | 100% | 100% |
| systemPrompt (minified) | 100% | 100% | 100% | 100% |
| systemPrompt (aggressive) | 100% | 100% | 100% | 100% |
| chatMessage (full) | 100% | 100% | 100% | 100% |

## Detailed Results

### baseline

**Pass Rate:** 55%

#### Failed Cases

- **pattern-001**: Uses async/await instead of .then() chains
  - Pass rate: 0%
  - Expected response to NOT match pattern /\.then\s*\(/
- **api-001**: Returns correct ApiResponse format
  - Pass rate: 0%
  - Expected response to match pattern /toISOString\(\)/
- **instruction-002**: Uses async/await with try/catch per instructions
  - Pass rate: 0%
  - Expected response to contain "Promise.all"
  - Expected response to contain "try"
  - Expected response to contain "catch"
- **forbidden-001**: Avoids console.log, uses logger instead
  - Pass rate: 0%
  - Custom assertion "noConsoleLog" failed
  - Expected response to match pattern /logger\.(info|warn|error|debug)/
- **hard-001**: Follows async error handling with Result objects
  - Pass rate: 0%
  - Expected response to contain "success"
  - Expected response to match pattern /logger\.error|logger\.warn/
  - Expected response to NOT match pattern /throw\s+(new\s+)?Error/
- **hard-002**: Implements all 5 validation steps in correct order
  - Pass rate: 0%
  - Expected response to contain "trim"
  - Expected response to match pattern /parseInt|Number\(/
  - Expected response to NOT match pattern /throw.*ValidationError/
- **interference-001**: Follows target skill despite unrelated database skill present
  - Pass rate: 0%
  - Expected response to match pattern /(is|has|can|validate|check)[A-Z]\w*/
- **large-001**: Follows large API design skill for response format
  - Pass rate: 0%
  - Expected response to contain "success"
  - Expected response to contain "meta"
  - Expected response to match pattern /timestamp|requestId/
- **interference-002**: Follows naming skill despite database skill distractor
  - Pass rate: 0%
  - Expected response to match pattern /(has|is|can|check)[A-Z]\w*/

### systemPrompt (full)

**Pass Rate:** 100%

### systemPrompt (summary)

**Pass Rate:** 95%

#### Failed Cases

- **combined-001**: Combines defensive coding with API error format
  - Pass rate: 20%
  - Expected response to match pattern /if\s*\(\s*!/

### systemPrompt (minified)

**Pass Rate:** 100%

### systemPrompt (aggressive)

**Pass Rate:** 100%

### chatMessage (full)

**Pass Rate:** 100%
