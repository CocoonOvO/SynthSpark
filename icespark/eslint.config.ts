import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

/**
 * icespark 的 lint 配置：
 *  - oxlint 先跑（快、覆盖 correctness），eslint 补 vue / TS 语义规则
 *  - prettier 只管排版，交给 `npm run format`
 *  - M/F/S 分层规则落在 eslint 里（见文件末尾）
 */
export default defineConfigWithVueTs(
  {
    name: 'icespark/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  // `**/.vite/**` 是 Vite 的依赖预打包缓存（dev 一跑就有）：里面是第三方产物，
  // 不是源码。不排除它，跑过 dev 之后再跑 `npm run check`，eslint 会去 lint
  // `pinia.js` / `chunk-*.js` 这些预打包文件并报出它们的 `@ts-expect-error` —— 门就成了
  // 「先跑过 dev 就红」的抽奖。仓库根的 `.gitignore` 已经忽略 `.vite/`，这里与它对齐。
  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    '**/.vite/**',
    'src/api/schema.d.ts',
  ]),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // M/F/S 不是文档里的说法，而是一条会失败的规则（架构 §4 约定 2）：
  // signal/ 是表现层最低一级，不许反向 import machine/ 的机器质感组件 ——
  // 否则「正文必须能退化」会被后来的人悄悄破坏。
  // scripts/check-independence.mjs 里有一条同口径的静态门，两者互为兜底。
  {
    name: 'icespark/layer-boundary',
    files: ['src/signal/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/machine/*', '**/machine/*'],
              message: 'M/F/S 分层：signal/ 不许依赖 machine/（正文要能独立退化）',
            },
          ],
        },
      ],
    },
  },

  skipFormatting,
)
