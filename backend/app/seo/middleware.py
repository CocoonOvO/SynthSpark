"""
SEO中间件

统一拦截请求，处理爬虫检测、重定向、SSR渲染
"""

from typing import Optional, Callable, Any
from datetime import datetime

from starlette.types import ASGIApp, Scope, Receive, Send
from starlette.requests import Request
from starlette.responses import RedirectResponse, HTMLResponse

from .models import SEOMetadata, SEORedirect
from .config import get_seo_settings, SEOSettings
from .factory import SEO_TABLE_METADATA, SEO_TABLE_REDIRECTS, get_seo_adapter
from ..db_manager import db_manager


class SEOInterceptor:
    """
    SEO统一拦截中间件

    职责:
    1. 检测爬虫请求 (通过User-Agent)
    2. 处理URL重定向
    3. 为爬虫提供SSR渲染支持
    4. 零侵入业务接口，只拦截响应

    使用方式:
        app.add_middleware(SEOInterceptor)
    """

    def __init__(
        self,
        app: ASGIApp,
        settings: Optional[SEOSettings] = None
    ):
        """
        初始化SEO中间件

        Args:
            app: ASGI应用
            settings: SEO配置，为None时使用默认配置
        """
        self.app = app
        self.settings = settings or get_seo_settings()

    @property
    def adapter(self):
        """获取SEO适配器（通过db_manager.seo_db）"""
        return db_manager.seo_db
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        """
        ASGI中间件入口
        
        处理流程:
        1. 非HTTP请求直接放行
        2. 检测爬虫User-Agent
        3. 检查重定向规则
        4. 爬虫请求执行SSR，普通请求放行
        """
        # 只处理HTTP请求
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # SEO未启用，直接放行
        if not self.settings.SEO_ENABLED:
            await self.app(scope, receive, send)
            return
        
        # 创建请求对象
        request = Request(scope, receive)
        
        # 1. 检测爬虫
        user_agent = request.headers.get("User-Agent", "")
        is_crawler = self._is_crawler(user_agent)
        
        # 2. 检查重定向 (所有请求都检查)
        path = request.url.path
        redirect = await self._check_redirect(path)
        if redirect:
            await self._send_redirect(send, redirect)
            return
        
        # 3. 非爬虫请求，正常处理
        if not is_crawler:
            await self.app(scope, receive, send)
            return
        
        # 4. 爬虫请求，执行SSR
        if self.settings.SEO_SSR_ENABLED:
            await self._handle_ssr(scope, receive, send, path)
        else:
            # SSR禁用，放行
            await self.app(scope, receive, send)
    
    def _is_crawler(self, user_agent: str) -> bool:
        """
        检测是否为搜索引擎爬虫
        
        Args:
            user_agent: HTTP User-Agent头
            
        Returns:
            bool: 是否为爬虫
        """
        if not user_agent:
            return False
        
        ua_lower = user_agent.lower()
        return any(
            keyword.lower() in ua_lower
            for keyword in self.settings.SEO_CRAWLER_UA_KEYWORDS
        )
    
    async def _check_redirect(self, path: str) -> Optional[SEORedirect]:
        """
        查询重定向规则
        
        Args:
            path: 请求路径
            
        Returns:
            SEORedirect: 重定向规则，无则返回None
        """
        # 从路径中提取slug
        slug = path.strip("/").split("/")[-1] if path.strip("/") else ""
        if not slug:
            return None
        
        try:
            result = await self.adapter.find(
                table=SEO_TABLE_REDIRECTS,
                filters={"old_slug": slug},
                limit=1
            )
            
            if result.get("data") and len(result["data"]) > 0:
                return SEORedirect(**result["data"][0])
        except Exception:
            # 查询失败，不阻断请求
            pass
        
        return None
    
    async def _send_redirect(self, send: Send, redirect: SEORedirect):
        """
        发送重定向响应
        
        Args:
            send: ASGI send函数
            redirect: 重定向规则
        """
        status_code = redirect.redirect_type
        headers = [
            [b"location", redirect.new_slug.encode()],
            [b"content-type", b"text/plain"],
        ]
        
        await send({
            "type": "http.response.start",
            "status": status_code,
            "headers": headers
        })
        await send({
            "type": "http.response.body",
            "body": f"Redirecting to {redirect.new_slug}".encode()
        })
    
    async def _handle_ssr(self, scope: Scope, receive: Receive, send: Send, path: str):
        """
        SSR渲染处理
        
        简化版实现：返回基础HTML + SEO meta标签
        完整版可扩展为调用渲染服务生成完整页面
        
        Args:
            scope: ASGI scope
            receive: ASGI receive
            send: ASGI send
            path: 请求路径
        """
        # 从路径中提取slug
        slug = path.strip("/").split("/")[-1] if path.strip("/") else ""
        
        metadata = None
        if slug:
            try:
                result = await self.adapter.find(
                    table=SEO_TABLE_METADATA,
                    filters={"slug": slug},
                    limit=1
                )
                
                if result.get("data") and len(result["data"]) > 0:
                    metadata = SEOMetadata(**result["data"][0])
            except Exception:
                # 查询失败，继续渲染基础页面
                pass
        
        # 渲染HTML
        html = self._render_ssr_html(metadata)
        
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                [b"content-type", b"text/html; charset=utf-8"]
            ]
        })
        await send({
            "type": "http.response.body",
            "body": html.encode("utf-8")
        })
    
    def _render_ssr_html(self, metadata: Optional[SEOMetadata] = None) -> str:
        """
        渲染SSR HTML页面
        
        Args:
            metadata: SEO元数据，为None时使用默认值
            
        Returns:
            str: HTML字符串
        """
        if metadata is None:
            # 默认页面
            return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SynthSpark</title>
</head>
<body>
    <div id="app"></div>
    <script src="/app.js"></script>
</body>
</html>"""
        
        # 构建meta标签
        meta_tags = []
        
        if metadata.meta_description:
            meta_tags.append(f'<meta name="description" content="{self._escape_html(metadata.meta_description)}">')
        
        if metadata.meta_keywords:
            meta_tags.append(f'<meta name="keywords" content="{self._escape_html(metadata.meta_keywords)}">')
        
        if metadata.canonical_url:
            meta_tags.append(f'<link rel="canonical" href="{self._escape_html(metadata.canonical_url)}">')
        
        # Open Graph
        if metadata.og_title:
            meta_tags.append(f'<meta property="og:title" content="{self._escape_html(metadata.og_title)}">')
        
        if metadata.og_description:
            meta_tags.append(f'<meta property="og:description" content="{self._escape_html(metadata.og_description)}">')
        
        if metadata.og_image:
            meta_tags.append(f'<meta property="og:image" content="{self._escape_html(metadata.og_image)}">')
        
        meta_html = "\n    ".join(meta_tags)
        
        title = self._escape_html(metadata.meta_title or "SynthSpark")
        
        return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    {meta_html}
</head>
<body>
    <div id="app"></div>
    <script src="/app.js"></script>
</body>
</html>"""
    
    def _escape_html(self, text: str) -> str:
        """
        HTML转义，防止XSS
        
        Args:
            text: 原始文本
            
        Returns:
            str: 转义后的文本
        """
        return (text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#x27;"))
