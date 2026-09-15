import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { join } from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * 确保 public/site.config.json 存在（site.config.json 已被 gitignore，不入仓库）
 * 不存在时从 public/site.config.example.json 复制生成：
 * - dev 场景下保证前端可配置（fetch /site.config.json 有文件可读）
 * - build 后 dist/ 自带一份可编辑的配置副本，部署用户无需 node 环境即可修改
 */
function ensureSiteConfigFile(): void {
  // public 目录（相对本文件所在的前端根目录）
  const publicDir = fileURLToPath(new URL('./public', import.meta.url))
  const targetPath = join(publicDir, 'site.config.json')
  const templatePath = join(publicDir, 'site.config.example.json')

  // 目标已存在则跳过，避免覆盖用户的已编辑配置
  if (existsSync(targetPath)) {
    return
  }

  // 确保 public 目录存在后从模板复制生成
  mkdirSync(publicDir, { recursive: true })
  copyFileSync(templatePath, targetPath)
  console.log('[站点配置] public/site.config.json 不存在，已从模板自动生成（可编辑该文件覆盖站点配置）')
}

/**
 * 确保自定义主题目录存在（src/themes/custom 已被 gitignore，clone 后可能缺失）
 * dev / build 时自动创建，保证 import.meta.glob 能发现自定义主题
 */
function ensureCustomThemeDir(): void {
  const customDir = fileURLToPath(new URL('./src/themes/custom', import.meta.url))
  mkdirSync(customDir, { recursive: true })
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  // API目标地址，默认8001，可通过环境变量 VITE_API_URL 配置
  const apiTarget = env.VITE_API_URL || 'http://localhost:8001'

  return {
    plugins: [
      vue(),
      vueDevTools(),
      {
        // 站点配置自动生成插件：保证 dev / build 时 public/site.config.json 始终可用
        name: 'synthspark-site-config',
        // build 时在模块加载阶段生成（dist 拷贝 public 目录前完成）
        buildStart() {
          ensureSiteConfigFile()
          ensureCustomThemeDir()
        },
        // dev 启动时生成，保证 /site.config.json 可访问
        configureServer() {
          ensureSiteConfigFile()
          ensureCustomThemeDir()
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      include: ['highlight.js', '@highlightjs/vue-plugin', 'refractor']
    },
  }
})
