import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

/**
 * icespark 的 lint 配置：
 *  - oxlint 先跑（快、覆盖 correctness），eslint 补 vue / TS 语义规则
 *  - prettier 只管排版，交给 `npm run format`
 *
 * P1 会再加一条 M/F/S 分层规则：`src/signal/**` 不许 import `src/machine/**`。
 * 现在这条由 scripts/check-independence.mjs 静态兜底（不依赖 eslint 插件）。
 */
export default defineConfigWithVueTs(
  {
    name: 'icespark/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'src/api/schema.d.ts']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
