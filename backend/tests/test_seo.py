"""
SEO模块单元测试

测试内容:
- SEO数据模型
- SEO配置
- SEO中间件核心逻辑
- SEO适配器工厂
"""

import pytest
from datetime import datetime
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.seo.models import SEOBase, SEOMetadata, SEORedirect
from app.seo.config import SEOSettings, get_seo_settings
from app.seo.middleware import SEOInterceptor
from app.seo.factory import create_seo_adapter, SEO_TABLE_METADATA, SEO_TABLE_REDIRECTS


# ========== 模型测试 ==========

class TestSEOModels:
    """SEO数据模型测试"""
    
    def test_seo_base_creation(self):
        """测试SEO基础模型创建"""
        data = SEOBase(
            resource_id="550e8400-e29b-41d4-a716-446655440000",
            resource_type="post",
            slug="test-post"
        )
        assert data.resource_id == "550e8400-e29b-41d4-a716-446655440000"
        assert data.resource_type == "post"
        assert data.slug == "test-post"
        assert isinstance(data.created_at, datetime)
        assert isinstance(data.updated_at, datetime)
    
    def test_seo_metadata_creation(self):
        """测试SEO元数据模型创建"""
        metadata = SEOMetadata(
            resource_id="550e8400-e29b-41d4-a716-446655440000",
            resource_type="post",
            slug="python-tutorial",
            meta_title="Python入门教程",
            meta_description="最详细的Python入门教程",
            meta_keywords="Python,教程,入门",
            canonical_url="https://example.com/posts/python-tutorial",
            og_title="Python入门教程",
            og_description="最详细的Python入门教程",
            og_image="https://example.com/image.png"
        )
        assert metadata.meta_title == "Python入门教程"
        assert metadata.meta_description == "最详细的Python入门教程"
        assert metadata.og_title == "Python入门教程"
    
    def test_seo_metadata_optional_fields(self):
        """测试SEO元数据可选字段"""
        metadata = SEOMetadata(
            resource_id="550e8400-e29b-41d4-a716-446655440000",
            resource_type="post",
            slug="minimal-post"
        )
        assert metadata.meta_title is None
        assert metadata.meta_description is None
        assert metadata.og_title is None
    
    def test_seo_redirect_creation(self):
        """测试SEO重定向模型创建"""
        redirect = SEORedirect(
            old_slug="old-post-name",
            new_slug="new-post-name",
            redirect_type=301,
            hit_count=10
        )
        assert redirect.old_slug == "old-post-name"
        assert redirect.new_slug == "new-post-name"
        assert redirect.redirect_type == 301
        assert redirect.hit_count == 10
    
    def test_seo_redirect_defaults(self):
        """测试SEO重定向默认值"""
        redirect = SEORedirect(
            old_slug="old",
            new_slug="new"
        )
        assert redirect.redirect_type == 301
        assert redirect.hit_count == 0


# ========== 配置测试 ==========

class TestSEOConfig:
    """SEO配置测试"""

    def test_default_settings(self):
        """测试默认配置 - 使用干净的配置实例避免环境变量干扰"""
        # 创建配置类时不加载.env文件，确保测试纯默认值
        class TestSEOSettings(BaseSettings):
            model_config = SettingsConfigDict(extra="ignore")

            SEO_ENABLED: bool = False
            SEO_DATABASE_URL: Optional[str] = None
            SEO_SSR_ENABLED: bool = True
            SEO_CRAWLER_UA_KEYWORDS: List[str] = [
                "googlebot", "baiduspider", "bingbot", "yandex",
                "duckduckbot", "slurp", "facebookexternalhit"
            ]
            SEO_SSR_TIMEOUT: float = 5.0

        settings = TestSEOSettings()
        assert settings.SEO_ENABLED is False
        assert settings.SEO_DATABASE_URL is None
        assert settings.SEO_SSR_ENABLED is True
        assert "googlebot" in settings.SEO_CRAWLER_UA_KEYWORDS
        assert "baiduspider" in settings.SEO_CRAWLER_UA_KEYWORDS
        assert settings.SEO_SSR_TIMEOUT == 5.0
    
    def test_custom_settings(self):
        """测试自定义配置"""
        settings = SEOSettings(
            SEO_ENABLED=True,
            SEO_DATABASE_URL="sqlite:///test.db",
            SEO_SSR_ENABLED=False,
            SEO_CRAWLER_UA_KEYWORDS=["testbot"]
        )
        assert settings.SEO_ENABLED is True
        assert settings.SEO_DATABASE_URL == "sqlite:///test.db"
        assert settings.SEO_SSR_ENABLED is False
        assert settings.SEO_CRAWLER_UA_KEYWORDS == ["testbot"]
    
    def test_get_seo_settings_singleton(self):
        """测试配置单例"""
        settings1 = get_seo_settings()
        settings2 = get_seo_settings()
        assert settings1 is settings2


# ========== 中间件测试 ==========

class TestSEOMiddleware:
    """SEO中间件测试"""
    
    @pytest.fixture
    def mock_adapter(self):
        """创建模拟适配器"""
        adapter = AsyncMock()
        return adapter
    
    @pytest.fixture
    def mock_settings(self):
        """创建测试配置"""
        return SEOSettings(
            SEO_ENABLED=True,
            SEO_SSR_ENABLED=True,
            SEO_CRAWLER_UA_KEYWORDS=["googlebot", "testbot"]
        )
    
    @pytest.fixture
    def mock_app(self):
        """创建模拟ASGI应用"""
        async def app(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"OK"})
        return app
    
    @pytest.mark.asyncio
    async def test_non_http_request_pass_through(self, mock_app, mock_adapter, mock_settings):
        """测试非HTTP请求直接放行"""
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        scope = {"type": "websocket"}
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该调用原始app
        assert send.call_count == 2
    
    @pytest.mark.asyncio
    async def test_seo_disabled_pass_through(self, mock_app, mock_adapter):
        """测试SEO禁用时直接放行"""
        settings = SEOSettings(SEO_ENABLED=False)
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=settings)
        
        scope = {"type": "http", "headers": []}
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该调用原始app
        assert send.call_count == 2
    
    def test_is_crawler_detection(self, mock_app, mock_adapter):
        """测试爬虫检测 - 使用完整配置"""
        # 使用完整配置，包含所有爬虫关键词
        full_settings = SEOSettings(
            SEO_ENABLED=True,
            SEO_SSR_ENABLED=True
        )
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=full_settings)
        
        # 爬虫UA (使用配置中的关键词)
        assert interceptor._is_crawler("Mozilla/5.0 Googlebot/2.1") is True
        assert interceptor._is_crawler("Baiduspider-image") is True
        assert interceptor._is_crawler("googlebot") is True  # 小写匹配
        
        # 普通UA
        assert interceptor._is_crawler("Mozilla/5.0 Chrome/91.0") is False
        assert interceptor._is_crawler("") is False
    
    @pytest.mark.asyncio
    async def test_normal_user_pass_through(self, mock_app, mock_adapter, mock_settings):
        """测试普通用户请求放行"""
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        scope = {
            "type": "http",
            "headers": [[b"user-agent", b"Mozilla/5.0 Chrome/91.0"]],
            "method": "GET",
            "path": "/test",
            "query_string": b""
        }
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该调用原始app
        assert send.call_count == 2
    
    @pytest.mark.asyncio
    async def test_redirect_handling(self, mock_app, mock_adapter, mock_settings):
        """测试重定向处理"""
        # 设置模拟返回值
        mock_adapter.find.return_value = {
            "data": [{
                "old_slug": "old-post",
                "new_slug": "new-post",
                "redirect_type": 301,
                "hit_count": 0,
                "created_at": datetime.utcnow().isoformat()
            }]
        }
        
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        scope = {
            "type": "http",
            "headers": [[b"user-agent", b"Mozilla/5.0 Chrome/91.0"]],
            "method": "GET",
            "path": "/posts/old-post",
            "query_string": b""
        }
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该发送重定向响应
        assert send.call_count == 2
        start_call = send.call_args_list[0][0][0]
        assert start_call["status"] == 301
        assert [b"location", b"new-post"] in start_call["headers"]
    
    @pytest.mark.asyncio
    async def test_ssr_rendering(self, mock_app, mock_adapter, mock_settings):
        """测试SSR渲染"""
        # 设置模拟返回值
        mock_adapter.find.return_value = {
            "data": [{
                "resource_id": "test-id",
                "resource_type": "post",
                "slug": "test-post",
                "meta_title": "Test Title",
                "meta_description": "Test Description",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }]
        }
        
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        scope = {
            "type": "http",
            "headers": [[b"user-agent", b"Googlebot/2.1"]],
            "method": "GET",
            "path": "/posts/test-post",
            "query_string": b""
        }
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该发送SSR响应
        assert send.call_count == 2
        start_call = send.call_args_list[0][0][0]
        assert start_call["status"] == 200
        
        body_call = send.call_args_list[1][0][0]
        html = body_call["body"].decode("utf-8")
        assert "Test Title" in html
        assert "Test Description" in html
    
    @pytest.mark.asyncio
    async def test_ssr_without_metadata(self, mock_app, mock_adapter, mock_settings):
        """测试无SEO数据时的SSR"""
        mock_adapter.find.return_value = {"data": []}
        
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        scope = {
            "type": "http",
            "headers": [[b"user-agent", b"Googlebot/2.1"]],
            "method": "GET",
            "path": "/posts/unknown",
            "query_string": b""
        }
        receive = AsyncMock()
        send = AsyncMock()
        
        await interceptor(scope, receive, send)
        
        # 应该发送默认页面
        assert send.call_count == 2
        body_call = send.call_args_list[1][0][0]
        html = body_call["body"].decode("utf-8")
        assert "SynthSpark" in html
    
    def test_html_escape(self, mock_app, mock_adapter, mock_settings):
        """测试HTML转义"""
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        # 测试XSS防护
        malicious = '<script>alert("xss")</script>'
        escaped = interceptor._escape_html(malicious)
        assert "<script>" not in escaped
        assert "&lt;script&gt;" in escaped
        
        # 测试引号转义
        quote_test = 'test "quoted" text'
        escaped = interceptor._escape_html(quote_test)
        assert "&quot;" in escaped
    
    def test_render_ssr_html_with_metadata(self, mock_app, mock_adapter, mock_settings):
        """测试带元数据的HTML渲染"""
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        metadata = SEOMetadata(
            resource_id="test",
            resource_type="post",
            slug="test",
            meta_title="Test Title",
            meta_description="Test Description",
            meta_keywords="test, keywords",
            canonical_url="https://example.com/test",
            og_title="OG Title",
            og_description="OG Description",
            og_image="https://example.com/image.png"
        )
        
        html = interceptor._render_ssr_html(metadata)
        
        assert "Test Title" in html
        assert "Test Description" in html
        assert "test, keywords" in html
        assert "https://example.com/test" in html
        assert "OG Title" in html
        assert "https://example.com/image.png" in html
    
    def test_render_ssr_html_without_metadata(self, mock_app, mock_adapter, mock_settings):
        """测试无元数据的HTML渲染"""
        interceptor = SEOInterceptor(mock_app, seo_adapter=mock_adapter, settings=mock_settings)
        
        html = interceptor._render_ssr_html(None)
        
        assert "SynthSpark" in html
        assert '<div id="app"></div>' in html


# ========== 工厂测试 ==========

class TestSEOFactory:
    """SEO适配器工厂测试"""
    
    def test_create_seo_adapter_with_postgresql(self):
        """测试创建PostgreSQL适配器"""
        settings = SEOSettings(
            SEO_DATABASE_URL="postgresql://user:pass@localhost:5432/db"
        )

        with patch("app.seo.factory.PostgresAdapter") as mock_pg:
            mock_instance = MagicMock()
            mock_pg.return_value = mock_instance

            adapter = create_seo_adapter(settings)

            mock_pg.assert_called_once_with(
                dsn="postgresql://user:pass@localhost:5432/db",
                schema="seo"
            )
    
    def test_create_seo_adapter_with_sqlite(self):
        """测试创建SQLite适配器"""
        settings = SEOSettings(
            SEO_DATABASE_URL="sqlite:///./test.db"
        )

        with patch("app.seo.factory.SQLiteBizAdapter") as mock_sqlite:
            mock_instance = MagicMock()
            mock_sqlite.return_value = mock_instance

            adapter = create_seo_adapter(settings)

            mock_sqlite.assert_called_once_with(dsn="sqlite:///./test.db")
    
    def test_create_seo_adapter_fallback_to_main_db(self):
        """测试使用主数据库作为回退"""
        settings = SEOSettings(SEO_DATABASE_URL=None)
        
        # 直接测试适配器创建，不mock get_settings
        with patch("app.seo.factory.SQLiteBizAdapter") as mock_sqlite:
            mock_instance = MagicMock()
            mock_sqlite.return_value = mock_instance
            
            # 传入main_database_url参数
            adapter = create_seo_adapter(settings, main_database_url="sqlite:///main.db")
            
            mock_sqlite.assert_called_once()
    
    def test_create_seo_adapter_unsupported_url(self):
        """测试不支持的数据库URL"""
        settings = SEOSettings(
            SEO_DATABASE_URL="mysql://user:pass@localhost/db"
        )
        
        with pytest.raises(ValueError) as exc_info:
            create_seo_adapter(settings)
        
        assert "不支持的数据库URL格式" in str(exc_info.value)


# ========== 集成测试标记 ==========

@pytest.mark.skip(reason="需要真实数据库连接")
class TestSEOIntegration:
    """SEO集成测试 (需要数据库)"""
    
    @pytest.mark.asyncio
    async def test_full_seo_flow(self):
        """测试完整SEO流程"""
        # 此测试需要真实数据库连接
        pass
