#!/usr/bin/env python3
"""
给「真实接口」补几篇带封面的文章（可选，只为设计评审时有形态可看）

为什么需要它：真实库里原本 6 篇全是同标题、且一张封面都没有，
「有封面 / 无封面混排」「长标题撑不撑得住」这些形态在真数据下根本看不到。

脚本做三件事（都可重复执行，标题已存在就跳过）：
  1. 用 PIL 现画 4 张 8bit 像素封面（小画布 + NEAREST 放大，沿用站点蓝色调色板）
  2. 通过 POST /api/upload/image 上传，拿到 /api/download/... 的 URL
  3. 通过 POST /api/posts/ 建文章：4 篇带封面、2 篇不带封面，
     其中故意留一条 67 字的超长标题 —— 用来压「标题会不会被卡片切掉」

用法（需要后端在 8002 跑着，PIL 与 requests 可用）：
    python3 scripts/seed-live-posts.py
    ICESPARK_SEED_USER=xxx ICESPARK_SEED_PW=yyy python3 scripts/seed-live-posts.py
"""
import os
import sys
from pathlib import Path

import requests

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('需要 Pillow：pip install pillow')

API = os.environ.get('ICESPARK_API', 'http://localhost:8002/api')
USER = os.environ.get('ICESPARK_SEED_USER', 'icespark_admin')
PW = os.environ.get('ICESPARK_SEED_PW', 'icespark2026')

PAL = {
    'deep': (18, 58, 82),
    'ink': (32, 86, 122),
    'mid': (75, 147, 209),
    'lite': (168, 207, 232),
    'pale': (214, 234, 247),
    'paper': (242, 248, 253),
}
K = 8  # 放大倍数：先在小画布上画，再 NEAREST 放大，得到硬边方块


def _up(im: Image.Image) -> Image.Image:
    return im.resize((im.width * K, im.height * K), Image.NEAREST)


def cover_a() -> Image.Image:
    """远山 + 方太阳 + 抖动水面"""
    W, H = 40, 25
    im = Image.new('RGB', (W, H), PAL['pale'])
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 9], fill=PAL['lite'])
    d.rectangle([0, 10, W, H], fill=PAL['paper'])
    d.rectangle([27, 4, 33, 9], fill=PAL['mid'])
    d.polygon([(0, 18), (8, 12), (16, 18)], fill=PAL['ink'])
    d.polygon([(12, 18), (22, 10), (32, 18)], fill=PAL['mid'])
    d.polygon([(26, 18), (34, 13), (40, 18)], fill=PAL['ink'])
    d.rectangle([0, 18, W, H], fill=PAL['deep'])
    for x in range(0, W, 3):
        d.point((x, 20), fill=PAL['mid'])
        d.point((x + 1, 22), fill=PAL['ink'])
    return _up(im)


def cover_b() -> Image.Image:
    """数据方块矩阵"""
    import random

    W, H = 40, 25
    im = Image.new('RGB', (W, H), PAL['paper'])
    d = ImageDraw.Draw(im)
    random.seed(7)
    for y in range(2, H - 2, 3):
        for x in range(2, W - 2, 3):
            v = random.random()
            c = PAL['lite'] if v < 0.6 else (PAL['mid'] if v < 0.85 else PAL['deep'])
            d.rectangle([x, y, x + 1, y + 1], fill=c)
    d.rectangle([0, 0, W - 1, H - 1], outline=PAL['ink'])
    d.rectangle([4, 4, 15, 15], fill=PAL['paper'], outline=PAL['mid'])
    for i in range(3):
        d.rectangle([6, 6 + i * 4, 13, 7 + i * 4], fill=PAL['mid'] if i else PAL['deep'])
    return _up(im)


def cover_c() -> Image.Image:
    """柱状 / 竖条"""
    W, H = 40, 25
    im = Image.new('RGB', (W, H), PAL['pale'])
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 14], fill=PAL['lite'])
    for i, h in enumerate([9, 14, 7, 17, 11, 19, 8, 15, 12]):
        x = 3 + i * 4
        d.rectangle([x, H - 3 - h, x + 2, H - 3], fill=PAL['mid'] if i % 2 else PAL['ink'])
        d.rectangle([x, H - 3 - h, x + 2, H - 3 - h], fill=PAL['deep'])
    d.rectangle([0, H - 2, W, H], fill=PAL['deep'])
    d.rectangle([30, 3, 34, 7], fill=PAL['mid'])
    return _up(im)


def cover_d() -> Image.Image:
    """星座节点 + 连线"""
    import random

    W, H = 40, 25
    im = Image.new('RGB', (W, H), PAL['deep'])
    d = ImageDraw.Draw(im)
    random.seed(3)
    pts = [(6, 8), (14, 5), (18, 15), (26, 10), (32, 17), (11, 18), (24, 20)]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        d.line([x1, y1, x2, y2], fill=PAL['ink'])
    for x, y in pts:
        d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=PAL['lite'])
        d.point((x, y), fill=PAL['paper'])
    for _ in range(28):
        d.point((random.randrange(W), random.randrange(H)), fill=PAL['ink'])
    return _up(im)


LONG = (
    '当上下文窗口装不下整本手册：一次把十六万字规范拆成可检索片段的完整尝试、'
    '中途推翻的两版索引结构，以及最后为什么又退回了最简单的关键词表'
)

BODY = """## 起因

这篇是给样机补的**真实数据**，用来验证「有封面 / 无封面混排」在真接口下的样子。

## 做法

1. 先把约束写下来，再动手；
2. 每写一条规则，都想清楚它**挡住什么**；
3. 挡不住任何东西的规则就删掉。

> 规则的价值不在于它说了什么，而在于它能拒绝什么。

## 三轮试验的对照

| 轮次 | 切法 | 结果 | 判断 |
| --- | --- | --- | --- |
| 第一轮 | 按章节硬切 | 命中率 41% | 上下文被切碎 |
| 第二轮 | 按语义聚类 | 命中率 58% | 邻居丢了，答案缺一半 |
| 第三轮 | 语义 + 重叠窗口 | 命中率 79% | 保留，代价是多存 30% 文本 |

## 相关的两篇

- [像素不是滤镜](/post/pixel-rules)
- [栅格还是弹性盒子](/post/grid-vs-flex)

```
$ npx vite build
✓ built in 2.84s
```
"""


def main() -> None:
    r = requests.post(f'{API}/auth/token', data={'username': USER, 'password': PW}, timeout=20)
    if r.status_code >= 400:
        sys.exit(f'登录失败（{r.status_code}）：{r.text[:200]}')
    headers = {'Authorization': f'Bearer {r.json()["access_token"]}'}

    groups = requests.get(f'{API}/groups/', headers=headers, timeout=20).json()
    if not groups:
        sys.exit('后端一个分组都没有，先在站点里建一个分组再跑这个脚本')
    group_id = groups[0]['id']

    # 先看库里已经有哪几篇（标题去重），一件都不用做时就不再上传图片
    existing = {
        q['title']
        for q in requests.get(
            f'{API}/posts/', headers=headers, params={'limit': 100}, timeout=20
        ).json()['items']
    }

    # 要补的 6 篇：cover 用封面代号，None 表示故意不给封面
    posts = [
        (
            '像素不是滤镜：一套 8bit 前端从零写出来的十条铁律',
            '低饱和蓝不是「调个色」，方角不是「把圆角设成 0」。把这些约束写成十条能自查的规则之后，'
            '界面才第一次稳定下来 —— 包括那条最容易被忽略的：像素字体只在 12 的倍数下锐利。',
            'a',
        ),
        (
            LONG,
            '索引结构推翻了两版：先按章节切，再按语义切，最后发现两种都让检索命中率下降 —— '
            '因为真正的问题不是切得不够细，而是切片丢掉了它们原本的邻居。',
            'b',
        ),
        (
            # 故意不给封面：这条是给「无封面文字卡 + 超长标题」压排版的
            '把一篇三万字的规范塞进一次对话：分块、重排、再分块的三轮试验，'
            '以及每一轮我到底在错误的地方省了什么',
            '没有封面的文章不该空着一块位置：这一篇就是拿来试排版的 —— '
            '顺便验证标题写长了之后，卡片会不会把字吃掉。',
            None,
        ),
        (
            '栅格还是弹性盒子：卡片混排时我选了前者',
            '同一行里有的卡有图、有的没有，高度还得齐平 —— 这不是 flex 擅长的活。',
            'c',
        ),
        (
            '无封面版式笔记：把「缺的那块」换成数据脊',
            '日期不是一行小字，而是字形的骨架；阅读与点赞贴在另一端，中间留一条 3px 的横线。',
            None,
        ),
        (
            '把站点画成星座：一次失败的信息图尝试',
            '我试图用节点和连线表达文章之间的关系，结果图很美、读不懂。',
            'd',
        ),
    ]

    todo = [q for q in posts if q[0] not in existing]
    if not todo:
        print('库里这几篇都在了，什么都没做（脚本可重复执行）')
        return

    # 只在真的要建文章时才画图上传，重复执行不会往 uploads 里塞重复文件
    out = Path(__file__).resolve().parent / '_covers'
    out.mkdir(exist_ok=True)
    covers: dict[str, str] = {}
    for key, fn in [('a', cover_a), ('b', cover_b), ('c', cover_c), ('d', cover_d)]:
        path = out / f'seed-cover-{key}.png'
        fn().save(path)
        with open(path, 'rb') as f:
            up = requests.post(
                f'{API}/upload/image',
                headers=headers,
                files={'file': (path.name, f, 'image/png')},
                timeout=20,
            )
        up.raise_for_status()
        covers[key] = up.json()['url']
        print(f'上传 {path.name} → {covers[key]}')

    for title, intro, key in todo:
        body = {
            'title': title,
            'content': BODY,
            'introduction': intro,
            'status': 'published',
            'tags': ['像素前端', '设计系统与模板'],
            'group_id': group_id,
        }
        if key:
            body['cover_image'] = covers[key]
        cr = requests.post(f'{API}/posts/', headers=headers, json=body, timeout=20)
        flag = '有封面' if key else '无封面'
        print(('OK   ' if cr.status_code < 400 else f'FAIL {cr.status_code} ') + f'{flag} {title[:24]}')
        if cr.status_code >= 400:
            print('     ', cr.text[:200])

    print(f'\n封面小图保存在 {out}（可删）')


if __name__ == '__main__':
    main()
