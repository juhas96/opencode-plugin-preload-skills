import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  estimateTokens,
  matchGlobPattern,
  matchesAnyPattern,
  checkCondition,
  extractKeywords,
  textContainsKeyword,
} from "./utils.js"

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("test")).toBe(1)
    expect(estimateTokens("hello world")).toBe(3)
    expect(estimateTokens("a".repeat(100))).toBe(25)
  })

  it("rounds up partial tokens", () => {
    expect(estimateTokens("ab")).toBe(1)
    expect(estimateTokens("abc")).toBe(1)
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcde")).toBe(2)
  })
})

describe("matchGlobPattern", () => {
  it("matches exact paths", () => {
    expect(matchGlobPattern("src/index.ts", "src/index.ts")).toBe(true)
    expect(matchGlobPattern("src/index.ts", "src/other.ts")).toBe(false)
  })

  it("matches single wildcard *", () => {
    expect(matchGlobPattern("src/index.ts", "src/*.ts")).toBe(true)
    expect(matchGlobPattern("src/utils.ts", "src/*.ts")).toBe(true)
    expect(matchGlobPattern("src/deep/index.ts", "src/*.ts")).toBe(false)
  })

  it("matches double wildcard **", () => {
    expect(matchGlobPattern("src/index.ts", "src/**")).toBe(true)
    expect(matchGlobPattern("src/deep/index.ts", "src/**")).toBe(true)
    expect(matchGlobPattern("src/a/b/c/index.ts", "src/**")).toBe(true)
    expect(matchGlobPattern("other/index.ts", "src/**")).toBe(false)
  })

  it("matches combined patterns", () => {
    expect(matchGlobPattern("src/api/users.ts", "src/api/**/*.ts")).toBe(true)
    expect(matchGlobPattern("src/api/v1/users.ts", "src/api/**/*.ts")).toBe(true)
    expect(matchGlobPattern("src/components/Button.tsx", "src/api/**/*.ts")).toBe(false)
  })

  it("escapes dots in extensions", () => {
    expect(matchGlobPattern("file.ts", "*.ts")).toBe(true)
    expect(matchGlobPattern("filets", "*.ts")).toBe(false)
  })
})

describe("matchesAnyPattern", () => {
  it("returns true if any pattern matches", () => {
    const patterns = ["src/**", "lib/**"]
    expect(matchesAnyPattern("src/index.ts", patterns)).toBe(true)
    expect(matchesAnyPattern("lib/utils.ts", patterns)).toBe(true)
    expect(matchesAnyPattern("test/index.ts", patterns)).toBe(false)
  })

  it("returns false for empty patterns", () => {
    expect(matchesAnyPattern("src/index.ts", [])).toBe(false)
  })
})

describe("checkCondition", () => {
  const testDir = join(process.cwd(), ".test-temp")

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("fileExists", () => {
    it("returns true when file exists", () => {
      writeFileSync(join(testDir, "exists.txt"), "content")
      expect(checkCondition({ fileExists: "exists.txt" }, testDir)).toBe(true)
    })

    it("returns false when file does not exist", () => {
      expect(checkCondition({ fileExists: "missing.txt" }, testDir)).toBe(false)
    })
  })

  describe("packageHasDependency", () => {
    it("returns true when dependency exists", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } })
      )
      expect(checkCondition({ packageHasDependency: "react" }, testDir)).toBe(true)
    })

    it("returns true for devDependencies", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ devDependencies: { vitest: "^1.0.0" } })
      )
      expect(checkCondition({ packageHasDependency: "vitest" }, testDir)).toBe(true)
    })

    it("returns false when dependency missing", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } })
      )
      expect(checkCondition({ packageHasDependency: "vue" }, testDir)).toBe(false)
    })

    it("returns false when no package.json", () => {
      expect(checkCondition({ packageHasDependency: "react" }, testDir)).toBe(false)
    })

    it("returns false when package.json is invalid JSON", () => {
      writeFileSync(join(testDir, "package.json"), "not valid json {{{")
      expect(checkCondition({ packageHasDependency: "react" }, testDir)).toBe(false)
    })
  })

  describe("envVar", () => {
    it("returns true when env var is set", () => {
      process.env.TEST_VAR = "value"
      expect(checkCondition({ envVar: "TEST_VAR" }, testDir)).toBe(true)
      delete process.env.TEST_VAR
    })

    it("returns false when env var is not set", () => {
      delete process.env.MISSING_VAR
      expect(checkCondition({ envVar: "MISSING_VAR" }, testDir)).toBe(false)
    })
  })

  describe("combined conditions", () => {
    it("all conditions must pass", () => {
      writeFileSync(join(testDir, "config.json"), "{}")
      process.env.TEST_COMBINED = "yes"

      expect(
        checkCondition(
          { fileExists: "config.json", envVar: "TEST_COMBINED" },
          testDir
        )
      ).toBe(true)

      expect(
        checkCondition(
          { fileExists: "missing.json", envVar: "TEST_COMBINED" },
          testDir
        )
      ).toBe(false)

      delete process.env.TEST_COMBINED
    })
  })
})

describe("extractKeywords", () => {
  it("extracts lowercase words of 3+ chars", () => {
    expect(extractKeywords("Hello World Test")).toEqual(["hello", "world", "test"])
  })

  it("ignores short words", () => {
    expect(extractKeywords("I am a test")).toEqual(["test"])
  })

  it("deduplicates words", () => {
    expect(extractKeywords("test test TEST")).toEqual(["test"])
  })

  it("handles empty string", () => {
    expect(extractKeywords("")).toEqual([])
  })
})

describe("textContainsKeyword", () => {
  it("finds keyword in text (case insensitive)", () => {
    expect(textContainsKeyword("Setup database connection", ["database"])).toBe(true)
    expect(textContainsKeyword("Setup DATABASE connection", ["database"])).toBe(true)
  })

  it("returns false when no keyword found", () => {
    expect(textContainsKeyword("Hello world", ["database", "api"])).toBe(false)
  })

  it("finds any matching keyword", () => {
    expect(textContainsKeyword("Build the API", ["database", "api"])).toBe(true)
  })

  it("handles empty inputs", () => {
    expect(textContainsKeyword("", ["test"])).toBe(false)
    expect(textContainsKeyword("test", [])).toBe(false)
  })
})
