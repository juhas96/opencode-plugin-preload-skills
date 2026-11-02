import { Plugin } from "@opencode/plugin"
import type { PreloadSkillsConfig, ParsedSkill } from "./types.js"
import { loadSkills, formatSkillsForInjection } from "./skills/loader.js"
import { setup as setupV2 } from "./v2/setup.js"
import { server as serverV1 } from "./v1/server.js"

export type { PreloadSkillsConfig, ParsedSkill }
export { loadSkills, formatSkillsForInjection }
// Exposed so programmatic consumers can extend (rather than retype) the default
// ignore-tag list, e.g. `[...DEFAULT_TRIGGER_IGNORE_TAGS, "my-plugin-context"]`.
export { DEFAULT_TRIGGER_IGNORE_TAGS } from "./config/loader.js"
export { stripIgnoredTags } from "./utils.js"

const pluginV2 = Plugin.define({
  id: "preload-skills",
  setup: setupV2,
})

export default {
  ...pluginV2,
  server: serverV1,
}
