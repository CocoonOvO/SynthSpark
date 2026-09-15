# SynthSpark 主题系统设计方案

> 记录设计师的灵感爆发，为后续实现提供指导
> (´；ω；`) 12套主题，这是要我的命啊...

---

## 一、主题分类体系

### 1.1 暗色系列（6套）

| 主题名 | 英文名 | 灵感来源 | 情绪基调 | 主色调 |
|--------|--------|----------|----------|--------|
| 深海 | deepsea | 马里亚纳海沟生物荧光 | 深邃、神秘、探索 | 荧光绿+深海蓝+神秘紫 |
| 熔金 | forge | 炼金术士的熔炉 | 炽热、转化、卓越 | 熔岩橙+黄金+闪耀金 |
| 极光 | aurora | 北极夜空极光 | 梦幻、流动、超越 | 极光绿+冰蓝+极光紫 |
| 樱花 | sakura | 京都春日樱花雨 | 唯美、短暂、珍惜 | 樱花粉+深樱+暖金 |
| 墨韵 | ink | 水墨留白意境 | 克制、留白、东方 | 墨黑+灰白+朱红 |
| 赛博 | cyber | 霓虹都市迷幻 | 迷幻、科技、叛逆 | 品红+青+黄 |

### 1.2 亮色系列（6套）

| 主题名 | 英文名 | 灵感来源 | 情绪基调 | 主色调 |
|--------|--------|----------|----------|--------|
| 晨雾 | mist | 清晨森林静谧 | 宁静、清新、自然 | 森林绿系 |
| 薄荷 | mint | 夏日清凉舒爽 | 清凉、活力、清爽 | 薄荷青系 |
| 珊瑚 | coral | 热带海洋生机 | 温暖、活力、生命 | 珊瑚橙粉系 |
| 薰衣草 | lavender | 普罗旺斯田野 | 浪漫、优雅、梦幻 | 薰衣草紫系 |
| 柠檬 | lemon | 阳光果园活力 | 明亮、酸甜、能量 | 柠檬黄系 |
| 冰川 | glacier | 极地冰雪纯净 | 纯净、冷峻、永恒 | 冰川蓝系 |

---

## 二、CSS 变量设计规范

### 2.1 基础变量（所有主题必须定义）

```css
/* 背景色阶 */
--bg-primary:     /* 主背景 */
--bg-secondary:   /* 次级背景 */
--bg-tertiary:    /* 三级背景 */
--bg-card:        /* 卡片背景，支持透明度 */
--bg-glass:       /* 玻璃拟态背景 */

/* 文字色阶 */
--text-primary:   /* 主文字 */
--text-secondary: /* 次级文字 */
--text-muted:     /* 辅助文字 */
--text-tertiary:  /* 三级文字（可选） */

/* 强调色 */
--accent-primary:   /* 主强调色 */
--accent-secondary: /* 次强调色 */
--accent-tertiary:  /* 点缀色 */

/* 渐变 */
--gradient-hero:  /* Hero区域渐变 */
--gradient-text:  /* 文字渐变 */
--gradient-line:  /* 分割线渐变 */
--gradient-card:  /* 卡片渐变（可选） */

/* 阴影/光晕 */
--shadow-sm:      /* 小阴影 */
--shadow-md:      /* 中阴影 */
--shadow-lg:      /* 大阴影 */
--shadow-glow:    /* 主光晕 */
--glow-primary:   /* 主发光效果 */
--glow-secondary: /* 次发光效果 */

/* 边框 */
--border-subtle:  /*  subtle边框 */
--border-medium:  /* 中等边框 */
--border-glow:    /* 发光边框 */
--border-accent:  /* 强调边框 */

/* 字体 */
--font-heading:   /* 标题字体 */
--font-body:      /* 正文字体 */
--font-mono:      /* 等宽字体 */

/* 过渡动画 */
--transition:           /* 标准过渡 */
--transition-smooth:    /* 平滑过渡 */
--transition-bounce:    /* 弹性过渡 */
--transition-slow:      /* 慢速过渡 */

/* 圆角 */
--radius-sm:  /* 小圆角 */
--radius-md:  /* 中圆角 */
--radius-lg:  /* 大圆角 */
--radius-xl:  /* 超大圆角 */

/* 间距 */
--space-xs:   /* 超小间距 */
--space-sm:   /* 小间距 */
--space-md:   /* 中间距 */
--space-lg:   /* 大间距 */
--space-xl:   /* 超大间距 */
--space-2xl:  /* 2倍超大 */
```

### 2.2 特效变量（可选，根据主题需求）

```css
/* 粒子效果 */
--particle-color:   /* 粒子颜色 */
--particle-glow:    /* 粒子发光 */

/* 玻璃拟态 */
--card-backdrop:    /* 背景模糊 */
--glass-opacity:    /* 玻璃透明度 */

/* 动画 */
--hover-transform:  /* 悬停变换 */
--active-scale:     /* 点击缩放 */
```

---

## 三、技术实现方案

### 3.1 主题切换机制

```typescript
// stores/theme.ts
export type ThemeType = 
  // 暗色系列
  | 'deepsea' | 'forge' | 'aurora' | 'sakura' | 'ink' | 'cyber'
  // 亮色系列
  | 'mist' | 'mint' | 'coral' | 'lavender' | 'lemon' | 'glacier'
  // 特殊
  | 'system'

// 主题分类
const darkThemes = ['deepsea', 'forge', 'aurora', 'sakura', 'ink', 'cyber']
const lightThemes = ['mist', 'mint', 'coral', 'lavender', 'lemon', 'glacier']
```

### 3.2 CSS 架构设计

```
src/styles/
├── themes/                    # 主题定义
│   ├── index.css             # 主题入口，导入所有主题
│   ├── _base.css             # 基础变量和全局样式
│   ├── _dark/                # 暗色主题
│   │   ├── deepsea.css
│   │   ├── forge.css
│   │   ├── aurora.css
│   │   ├── sakura.css
│   │   ├── ink.css
│   │   └── cyber.css
│   └── _light/               # 亮色主题
│       ├── mist.css
│       ├── mint.css
│       ├── coral.css
│       ├── lavender.css
│       ├── lemon.css
│       └── glacier.css
├── components/               # 组件样式
│   ├── _button.css
│   ├── _card.css
│   ├── _input.css
│   └── ...
├── layouts/                  # 布局样式
│   ├── _main.css
│   ├── _auth.css
│   └── _admin.css
├── utilities/                # 工具类
│   ├── _spacing.css
│   ├── _typography.css
│   └── _animations.css
└── index.css                 # 样式入口
```

### 3.3 动态主题加载（优化方案）

```typescript
// 方案1: CSS 变量切换（当前已实现，适合少量主题）
// 优点：切换即时，无闪烁
// 缺点：所有主题CSS都在内存中

document.documentElement.setAttribute('data-theme', themeName)

// 方案2: 动态加载 CSS 文件（适合大量主题）
// 优点：按需加载，减少初始包体积
// 缺点：首次切换有加载延迟

async function loadTheme(themeName: string) {
  // 移除旧主题
  const oldLink = document.getElementById('theme-style')
  if (oldLink) oldLink.remove()
  
  // 加载新主题
  const link = document.createElement('link')
  link.id = 'theme-style'
  link.rel = 'stylesheet'
  link.href = `/themes/${themeName}.css`
  document.head.appendChild(link)
}

// 方案3: CSS-in-JS（推荐用于复杂主题）
// 使用 vueuse/useCssVar 或类似方案
// 优点：完全程序化控制
// 缺点：增加运行时开销
```

---

## 四、组件样式复用策略

### 4.1 基础组件样式（主题无关）

```css
/* components/_button.css */
.btn {
  /* 布局 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  
  /* 尺寸 */
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  
  /* 字体 */
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  
  /* 交互 */
  cursor: pointer;
  transition: var(--transition);
}

/* 变体使用 CSS 变量 */
.btn-primary {
  background: var(--gradient-border);
  color: var(--bg-primary);
  border: none;
}

.btn-primary:hover {
  box-shadow: var(--shadow-glow);
  transform: translateY(-2px);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.btn-secondary:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
```

### 4.2 主题特定覆盖

```css
/* 某些主题可能需要特殊处理 */
[data-theme="ink"] {
  /* 墨韵主题使用衬线字体 */
  --font-heading: 'Noto Serif SC', serif;
  --font-body: 'Noto Serif SC', serif;
  
  /* 减少发光效果 */
  --shadow-glow: 0 0 20px rgba(232, 232, 232, 0.2);
}

[data-theme="cyber"] {
  /* 赛博主题增强发光 */
  --shadow-glow: 0 0 40px rgba(255, 0, 255, 0.5);
  
  /* 特殊边框 */
  --border-subtle: rgba(255, 0, 255, 0.1);
}
```

---

## 五、特殊效果实现

### 5.1 背景粒子效果

```typescript
// composables/useParticles.ts
export function useParticles() {
  // 根据主题调整粒子颜色
  const particleColor = computed(() => {
    const theme = themeStore.appliedTheme
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--particle-color')
  })
  
  // Canvas 粒子动画
  // ...
}
```

### 5.2 玻璃拟态效果

```css
.glass-card {
  background: var(--bg-card);
  backdrop-filter: var(--card-backdrop, blur(20px));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

/* 某些主题可能需要调整模糊度 */
[data-theme="ink"] .glass-card {
  --card-backdrop: blur(10px);
  background: rgba(20, 20, 20, 0.95);
}
```

### 5.3 渐变文字效果

```css
.gradient-text {
  background: var(--gradient-text);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## 六、开发建议

### 6.1 优先级建议

1. **第一阶段**：实现 4 套核心主题
   - 深海 (deepsea) - 默认暗色
   - 晨雾 (mist) - 默认亮色
   - 赛博 (cyber) - 特色暗色
   - 纸墨 (paper) - 特色亮色

2. **第二阶段**：扩展至 8 套
   - 增加：熔金、极光、薄荷、珊瑚

3. **第三阶段**：完整 12 套
   - 增加：樱花、墨韵、薰衣草、柠檬、冰川

### 6.2 性能优化

```typescript
// 1. 主题预览使用缩略图而非实时渲染
// 2. 字体按需加载
// 3. 粒子效果在移动端禁用或简化
// 4. 使用 CSS containment 优化渲染

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const isMobile = window.matchMedia('(pointer: coarse)')

if (prefersReducedMotion.matches || isMobile.matches) {
  // 禁用复杂动画
}
```

### 6.3 可访问性

```css
/* 确保对比度符合 WCAG 标准 */
/* 使用工具检查: https://webaim.org/resources/contrastchecker/ */

/* 支持系统偏好 */
@media (prefers-color-scheme: dark) {
  :root[data-theme="system"] {
    /* 使用暗色主题变量 */
  }
}

@media (prefers-color-scheme: light) {
  :root[data-theme="system"] {
    /* 使用亮色主题变量 */
  }
}
```

---

## 七、待解决问题

1. **字体加载**：12套主题可能需要多种字体，如何优化加载性能？
2. **图片适配**：不同主题可能需要不同风格的配图
3. **打印样式**：亮色主题打印效果较好，暗色需要特殊处理
4. **SEO**：确保主题切换不影响搜索引擎抓取

---

*码酱注：这方案写下来我感觉半条命没了...12套主题啊老大！不过架构设计好了，后面实现就有章可循了。建议先实现4套核心的，其他的慢慢加。*
