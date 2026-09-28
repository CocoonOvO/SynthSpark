#!/usr/bin/env node
/**
 * 独立性门（P0，架构 §4）。
 *
 * 独立不能只是口号，所以逐条写成判定函数：
 *   1. EXTERNAL_IMPORT        src 里任何相对导入 / `@` 别名都不许指到 icespark/ 之外（偷偷 import 旧前端）
 *   2. FORBIDDEN_PACKAGE      旧前端 / 样机专有依赖（element-plus、prismjs、refractor…）出现即失败
 *   3. UNDECLARED_PACKAGE     用了没在 package.json 声明的包
 *   4. UNAPPROVED_PACKAGE     声明了但不在架构选型白名单里
 *   5. STATIC_EDITOR_IMPORT   @milkdown/* 只能动态 import，否则编辑器会混进阅读 bundle
 *   6. LAYER_VIOLATION        signal/ 不许 import machine/（M/F/S 分层的底线）
 *   7. STORAGE_KEY            localStorage / sessionStorage 的字面量键必须带 synthspark 前缀
 *   8. LEGACY_NAMING          废弃命名残留（同 AGENTS.md 第 1 节的自查口径）
 *   9. APP_IS_NOT_STANDALONE  自带 package.json、不引 workspace、不依赖仓库里的别的目录
 *
 * 已知边界：存储键门只看字面量（`localStorage.setItem('x')` 这种）。
 * 键名写在常量里再由常量传进去的情况，靠 P2 的运行时门（枚举 localStorage）兜底。
 *
 * 运行：npm run check:independence
 * 自测：node scripts/check-independence.mjs --selftest
 *       —— 把反例喂给同一套判定函数，证明门真的会响（而不是永远打 PASS）
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = resolve(APP_ROOT, 'src')
const MACHINE_DIR = resolve(SRC_DIR, 'machine')
const PKG_FILE = resolve(APP_ROOT, 'package.json')

/** 生成物标记：文件里带这句就不扫（src/api/schema.d.ts 是 openapi-typescript 的产物） */
const GENERATED_MARK = '请勿手改'

const SOURCE_EXTENSIONS = ['.ts', '.mts', '.mjs', '.vue', '.css']
/** src 之外还要看命名口径的工程文件 */
const EXTRA_FILES = ['index.html', 'vite.config.ts', 'eslint.config.ts', 'package.json']

/* ────────────── 白名单：架构 §2 定稿的选型 ────────────── */

const RUNTIME_ALLOW = new Set([
  'vue',
  'vue-router',
  'pinia',
  'markdown-it',
  'dompurify',
  'highlight.js',
])
/** 编辑器整条链：只允许动态 import，所以按前缀放行 */
const RUNTIME_ALLOW_PREFIX = ['@milkdown/']
const DEV_ALLOW = new Set([
  '@tsconfig/node24',
  '@vitejs/plugin-vue',
  '@vue/eslint-config-typescript',
  '@vue/tsconfig',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-oxlint',
  'eslint-plugin-vue',
  'jiti',
  'openapi-typescript',
  'oxlint',
  'prettier',
  'typescript',
  'vite',
  'vue-tsc',
  // P1/P2 起的测试链：预先批准，免得下一轮又要改门
  '@playwright/test',
  '@vitest/eslint-plugin',
  '@vue/test-utils',
  'vitest',
  'jsdom',
])
const DEV_ALLOW_PREFIX = ['@types/', '@axe-core/']
/** 旧前端 / 样机专有依赖：出现即失败 */
const FORBIDDEN = new Set([
  'element-plus',
  '@element-plus/icons-vue',
  'prismjs',
  'refractor',
  'axios',
  'js-cookie',
  'vite-plugin-vue-devtools',
  '@highlightjs/vue-plugin',
])
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'os',
  'path',
  'process',
  'stream',
  'url',
  'util',
  'zlib',
])

/* ────────────── 规则清单（决定输出的顺序） ────────────── */

const RULES = [
  { code: 'EXTERNAL_IMPORT', label: 'src 内零外部 import（不指向 icespark/ 之外）' },
  { code: 'FORBIDDEN_PACKAGE', label: '无旧前端 / 样机专有依赖' },
  { code: 'UNDECLARED_PACKAGE', label: '没用未声明的依赖' },
  { code: 'UNAPPROVED_PACKAGE', label: '依赖都在架构选型白名单内' },
  { code: 'STATIC_EDITOR_IMPORT', label: '@milkdown 只允许动态 import' },
  { code: 'LAYER_VIOLATION', label: 'signal/ 不反向依赖 machine/' },
  { code: 'STORAGE_KEY', label: '存储键带 synthspark 前缀' },
  { code: 'LEGACY_NAMING', label: '无废弃命名残留' },
  { code: 'APP_IS_NOT_STANDALONE', label: '自带 package.json，不引 workspace、不依赖别的目录' },
]

/* ────────────── 工具函数 ────────────── */

const LEGACY_NAMING = /synth[_-]?ink/i

/** 违规记一条 */
function violation(code, file, detail, line) {
  return { code, file, detail, line }
}

function toPosix(value) {
  return value.split(sep).join('/')
}

function insideRoot(abs) {
  const rel = relative(APP_ROOT, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 从 `pkg/sub/path` / `@scope/pkg/sub` 里取出包名 */
function packageOf(specifier) {
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) return parts.slice(0, 2).join('/')
  return parts[0]
}

function isApprovedRuntime(name) {
  return RUNTIME_ALLOW.has(name) || RUNTIME_ALLOW_PREFIX.some((prefix) => name.startsWith(prefix))
}

function isApprovedDev(name) {
  return DEV_ALLOW.has(name) || DEV_ALLOW_PREFIX.some((prefix) => name.startsWith(prefix))
}

/** import 的四种写法：动态 import()、from、副作用 import、CSS @import */
const IMPORT_PATTERNS = [
  { re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, dynamic: true },
  { re: /\bfrom\s*['"]([^'"]+)['"]/g, dynamic: false },
  { re: /\bimport\s+['"]([^'"]+)['"]/g, dynamic: false },
  { re: /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g, dynamic: false },
]

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

function extractImports(text) {
  const found = []
  const seen = new Set()

  for (const { re, dynamic } of IMPORT_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const spec = match[1]
      const line = lineOf(text, match.index)
      const key = `${spec}@${line}@${dynamic}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ spec, dynamic, line })
    }
  }

  return found
}

/* ────────────── 判定函数（自测与真实扫描走同一套） ────────────── */

function checkImports(files, pkg) {
  const out = []
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])
  const signalPrefix = `${toPosix(relative(APP_ROOT, SRC_DIR))}/signal/`

  for (const file of files) {
    const baseDir = dirname(file.path)

    for (const { spec, dynamic, line } of extractImports(file.text)) {
      // 相对路径 / `@` 别名：解析成绝对路径，必须落在 icespark/ 内
      let abs = null
      if (spec.startsWith('./') || spec.startsWith('../')) {
        abs = resolve(baseDir, spec)
        if (!insideRoot(abs)) {
          out.push(
            violation('EXTERNAL_IMPORT', file.rel, `相对导入指到 icespark/ 之外：${spec}`, line),
          )
          continue
        }
      } else if (spec.startsWith('@/')) {
        abs = resolve(SRC_DIR, spec.slice(2))
        if (!insideRoot(abs)) {
          out.push(
            violation('EXTERNAL_IMPORT', file.rel, `别名导入指到 icespark/ 之外：${spec}`, line),
          )
          continue
        }
      } else if (spec.startsWith('~') || spec.startsWith('src/')) {
        out.push(violation('EXTERNAL_IMPORT', file.rel, `未定义的别名：${spec}`, line))
        continue
      } else if (spec.startsWith('/') || spec.startsWith('#')) {
        // 公共资源 URL、Vite 的 `#` 内部导入：与独立性无关
        continue
      } else {
        // 裸包名
        const name = packageOf(spec)

        if (name.startsWith('node:') || NODE_BUILTINS.has(name)) continue

        if (FORBIDDEN.has(name)) {
          out.push(violation('FORBIDDEN_PACKAGE', file.rel, `旧前端 / 样机专有依赖：${name}`, line))
          continue
        }
        if (!declared.has(name)) {
          out.push(
            violation('UNDECLARED_PACKAGE', file.rel, `没在 package.json 声明：${name}`, line),
          )
        }
        if (!isApprovedRuntime(name) && !isApprovedDev(name)) {
          out.push(violation('UNAPPROVED_PACKAGE', file.rel, `不在架构选型白名单里：${name}`, line))
        }
        if (name.startsWith('@milkdown/') && !dynamic) {
          out.push(
            violation(
              'STATIC_EDITOR_IMPORT',
              file.rel,
              `必须动态 import，否则进阅读 bundle：${spec}`,
              line,
            ),
          )
        }
      }

      // M/F/S 分层：signal/ 是表现层最低一级，不许反向依赖 machine/ 的机器质感组件
      if (abs !== null && file.rel.startsWith(signalPrefix)) {
        if (abs === MACHINE_DIR || abs.startsWith(`${MACHINE_DIR}${sep}`)) {
          out.push(violation('LAYER_VIOLATION', file.rel, `signal/ 引用了 machine/：${spec}`, line))
        }
      }
    }
  }

  return out
}

function checkDependencies(pkg) {
  const out = []

  const groups = [
    { key: 'dependencies', approved: isApprovedRuntime, label: '运行时依赖' },
    { key: 'devDependencies', approved: isApprovedDev, label: '开发依赖' },
  ]

  for (const group of groups) {
    for (const [name, version] of Object.entries(pkg[group.key] ?? {})) {
      if (FORBIDDEN.has(name)) {
        out.push(
          violation(
            'FORBIDDEN_PACKAGE',
            'package.json',
            `${group.label}里出现旧前端专有包：${name}`,
          ),
        )
        continue
      }
      if (!group.approved(name)) {
        out.push(
          violation('UNAPPROVED_PACKAGE', 'package.json', `${group.label}不在架构选型里：${name}`),
        )
      }
      // file:/link: 指向仓库里别的目录 = 变相共享代码，直接把独立性破掉
      if (typeof version === 'string' && /^(file|link):/.test(version)) {
        const target = resolve(APP_ROOT, version.replace(/^(file|link):/, ''))
        if (!insideRoot(target)) {
          out.push(
            violation(
              'EXTERNAL_IMPORT',
              'package.json',
              `依赖指向 icespark/ 之外：${name} → ${version}`,
            ),
          )
        }
      }
    }
  }

  return out
}

function checkStorageKeys(files) {
  const out = []
  const keyRe =
    /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]+)['"`]/g

  for (const file of files) {
    keyRe.lastIndex = 0
    let match
    while ((match = keyRe.exec(file.text)) !== null) {
      const key = match[1]
      if (!/^synthspark(-|$)/.test(key)) {
        out.push(
          violation(
            'STORAGE_KEY',
            file.rel,
            `存储键必须以 synthspark 开头（AGENTS.md 第 1 节）：${key}`,
            lineOf(file.text, match.index),
          ),
        )
      }
    }
  }

  return out
}

function checkNaming(files, pkg) {
  const out = []

  if (typeof pkg.name === 'string' && LEGACY_NAMING.test(pkg.name)) {
    out.push(violation('LEGACY_NAMING', 'package.json', `包名里有废弃命名：${pkg.name}`))
  }

  for (const file of files) {
    const match = LEGACY_NAMING.exec(file.text)
    if (match !== null) {
      out.push(
        violation(
          'LEGACY_NAMING',
          file.rel,
          `出现废弃命名：${match[0]}`,
          lineOf(file.text, match.index),
        ),
      )
    }
  }

  return out
}

function checkStandalone(pkg) {
  const out = []

  if (pkg.name !== 'icespark') {
    out.push(
      violation('APP_IS_NOT_STANDALONE', 'package.json', `包名应为 icespark，实际是 ${pkg.name}`),
    )
  }
  if (Array.isArray(pkg.workspaces) ? pkg.workspaces.length > 0 : Boolean(pkg.workspaces)) {
    out.push(
      violation('APP_IS_NOT_STANDALONE', 'package.json', '不许引 workspace（约定 1：独立 app）'),
    )
  }

  return out
}

function runChecks({ files, pkg }) {
  return [
    ...checkImports(files, pkg),
    ...checkDependencies(pkg),
    ...checkStorageKeys(files),
    ...checkNaming(files, pkg),
    ...checkStandalone(pkg),
  ]
}

/* ────────────── 真实扫描 ────────────── */

async function walk(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
      continue
    const abs = resolve(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(abs)))
    else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(abs)
  }

  return out
}

async function loadProject() {
  const pkg = JSON.parse(await readFile(PKG_FILE, 'utf8'))
  const files = []
  let generated = 0

  const push = (rel, path, text) => {
    if (text.includes(GENERATED_MARK)) {
      generated += 1
      return
    }
    files.push({ rel, path, text })
  }

  for (const abs of await walk(SRC_DIR)) {
    push(toPosix(relative(APP_ROOT, abs)), abs, await readFile(abs, 'utf8'))
  }

  for (const extra of EXTRA_FILES) {
    const abs = resolve(APP_ROOT, extra)
    try {
      push(extra, abs, await readFile(abs, 'utf8'))
    } catch {
      // 还没创建的文件不算违规
    }
  }

  return { pkg, files, generated }
}

function report(violations, meta) {
  console.log(`独立性门（P0）· 扫描 ${meta.files} 个文件`)
  console.log(
    `              依赖 ${Object.keys(meta.pkg.dependencies ?? {}).length} 运行时 / ` +
      `${Object.keys(meta.pkg.devDependencies ?? {}).length} 开发` +
      (meta.generated > 0 ? ` · 跳过 ${meta.generated} 个生成物` : ''),
  )

  let failed = 0
  for (const rule of RULES) {
    const hits = violations.filter((item) => item.code === rule.code)
    if (hits.length === 0) {
      console.log(`  PASS  ${rule.label}`)
      continue
    }
    failed += 1
    console.log(`  FAIL  ${rule.label} —— ${hits.length} 处`)
    for (const hit of hits.slice(0, 5)) {
      console.log(`          ${hit.file}${hit.line ? `:${hit.line}` : ''}  ${hit.detail}`)
    }
    if (hits.length > 5) console.log(`          …… 另有 ${hits.length - 5} 处`)
  }

  const known = new Set(RULES.map((rule) => rule.code))
  for (const hit of violations.filter((item) => !known.has(item.code))) {
    failed += 1
    console.log(`  FAIL  ${hit.code}  ${hit.file}  ${hit.detail}`)
  }

  console.log(
    failed === 0
      ? '\n独立性门通过：零外部 import、依赖合规、无旧命名残留。'
      : `\n独立性门未通过：${failed} 条规则被踩。`,
  )

  process.exitCode = failed === 0 ? 0 : 1
}

/* ────────────── 自测：反例必须被挡住，正例必须被放行 ────────────── */

const SELFTEST_BASE_PKG = { name: 'icespark', dependencies: { vue: '3.5.41' }, devDependencies: {} }

function file(rel, text) {
  // rel 是相对 icespark/ 的写法（与真实扫描一致），这样相对导入的解析结果才真实
  return { rel, path: resolve(APP_ROOT, rel), text }
}

const SELFTEST_CASES = [
  {
    name: '相对导入逃出 icespark/（偷偷 import 旧前端 api）',
    files: [file('src/api/client.ts', "import { http } from '../../../frontend/src/api/http'")],
    expect: 'EXTERNAL_IMPORT',
  },
  {
    name: '`@` 别名绕过：@/../../frontend/...',
    files: [file('src/router/index.ts', "import { user } from '@/../../frontend/src/stores/user'")],
    expect: 'EXTERNAL_IMPORT',
  },
  {
    name: '旧前端专有依赖 element-plus',
    files: [
      file(
        'src/frame/Button.vue',
        '<script setup lang="ts">\nimport { ElButton } from \'element-plus\'',
      ),
    ],
    expect: 'FORBIDDEN_PACKAGE',
  },
  {
    name: '用了没声明的包',
    files: [file('src/frame/util.ts', "import merge from 'lodash-es'")],
    expect: 'UNDECLARED_PACKAGE',
  },
  {
    name: '声明了但不在架构选型白名单里',
    files: [file('src/frame/util.ts', "import pad from 'left-pad'")],
    pkg: {
      name: 'icespark',
      dependencies: { vue: '3.5.41' },
      devDependencies: { 'left-pad': '1.0.0' },
    },
    expect: 'UNAPPROVED_PACKAGE',
  },
  {
    name: 'package.json 里塞进旧前端专有依赖',
    files: [],
    pkg: { name: 'icespark', dependencies: { vue: '3.5.41', 'element-plus': '2.0.0' } },
    expect: 'FORBIDDEN_PACKAGE',
  },
  {
    name: '静态 import @milkdown（编辑器会进阅读 bundle）',
    files: [file('src/views/PostDetailView.vue', "import { Editor } from '@milkdown/core'")],
    pkg: { name: 'icespark', dependencies: { vue: '3.5.41', '@milkdown/core': '7.22.0' } },
    expect: 'STATIC_EDITOR_IMPORT',
  },
  {
    name: '动态 import @milkdown —— 应当放行',
    files: [
      file('src/views/PostEditView.vue', "const { Editor } = await import('@milkdown/core')"),
    ],
    pkg: { name: 'icespark', dependencies: { vue: '3.5.41', '@milkdown/core': '7.22.0' } },
    expect: null,
  },
  {
    name: 'signal/ 反向依赖 machine/',
    files: [file('src/signal/body.ts', "import { Dialog } from '@/machine/dialog'")],
    expect: 'LAYER_VIOLATION',
  },
  {
    name: 'signal/ 依赖 frame/ —— 应当放行',
    files: [file('src/signal/body.ts', "import { Card } from '@/frame/card'")],
    expect: null,
  },
  {
    name: '存储键没带 synthspark 前缀',
    files: [file('src/api/client.ts', "localStorage.setItem('icespark-token', 'x')")],
    expect: 'STORAGE_KEY',
  },
  {
    name: '存储键合规 —— 应当放行',
    files: [file('src/api/client.ts', "localStorage.setItem('synthspark-icespark-sound', '1')")],
    expect: null,
  },
  {
    name: '废弃命名残留',
    // 反例字符串在运行时拼出来，免得这个脚本自己被自查命令命中
    files: [file('src/config/copy.ts', `export const legacy = '${'synth' + '_ink'}'`)],
    expect: 'LEGACY_NAMING',
  },
  {
    name: '引入 workspace',
    files: [],
    pkg: { name: 'icespark', workspaces: ['packages/*'] },
    expect: 'APP_IS_NOT_STANDALONE',
  },
  {
    name: '依赖指到仓库里别的目录（file:../frontend）',
    files: [],
    pkg: { name: 'icespark', dependencies: { old: 'file:../frontend' } },
    expect: 'EXTERNAL_IMPORT',
  },
]

function selftest() {
  console.log('独立性门自测：拿反例与正例喂给同一套判定函数')
  let failed = 0

  for (const test of SELFTEST_CASES) {
    const violations = runChecks({
      files: test.files,
      pkg: test.pkg ?? SELFTEST_BASE_PKG,
    })
    const codes = [...new Set(violations.map((item) => item.code))]
    const ok = test.expect === null ? violations.length === 0 : codes.includes(test.expect)
    if (!ok) failed += 1

    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${test.name}\n` +
        `          期望 ${test.expect ?? '无违规'} · 实际 ${codes.length > 0 ? codes.join(' / ') : '无违规'}`,
    )
  }

  console.log(
    failed === 0
      ? `\n自测通过：${SELFTEST_CASES.length} 个用例全部符合预期。`
      : `\n自测未通过：${failed} 个用例不符合预期。`,
  )

  process.exitCode = failed === 0 ? 0 : 1
}

/* ────────────── 入口 ────────────── */

const argv = process.argv.slice(2)

if (argv.includes('--selftest')) {
  selftest()
} else if (argv.includes('--help') || argv.includes('-h')) {
  console.log(
    '独立性门\n\n  node scripts/check-independence.mjs            # 扫 icespark/\n' +
      '  node scripts/check-independence.mjs --selftest  # 跑反例自测\n',
  )
} else {
  const { pkg, files, generated } = await loadProject()
  report(runChecks({ files, pkg }), { pkg, files: files.length, generated })
}
