"""
SEO数据模型

使用Pydantic定义SEO相关数据结构
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class SEOBase(BaseModel):
    """SEO数据基础模型"""
    resource_id: str = Field(..., description="关联的业务资源ID")
    resource_type: str = Field(..., description="资源类型: post, tag, group")
    slug: str = Field(..., description="URL标识")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="更新时间")


class SEOMetadata(SEOBase):
    """SEO元数据模型"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "resource_id": "550e8400-e29b-41d4-a716-446655440000",
                "resource_type": "post",
                "slug": "python-tutorial",
                "meta_title": "Python入门教程",
                "meta_description": "最详细的Python入门教程...",
                "meta_keywords": "Python,教程,入门",
                "canonical_url": "https://synthspark.com/posts/python-tutorial",
                "og_title": "Python入门教程",
                "og_description": "最详细的Python入门教程...",
                "og_image": "https://synthspark.com/images/python.png",
                "created_at": "2026-03-08T10:00:00",
                "updated_at": "2026-03-08T10:00:00"
            }
        }
    )
    
    meta_title: Optional[str] = Field(None, description="SEO标题", max_length=100)
    meta_description: Optional[str] = Field(None, description="SEO描述", max_length=300)
    meta_keywords: Optional[str] = Field(None, description="关键词", max_length=500)
    canonical_url: Optional[str] = Field(None, description="规范URL", max_length=500)
    
    # Open Graph (可选)
    og_title: Optional[str] = Field(None, description="OG标题", max_length=100)
    og_description: Optional[str] = Field(None, description="OG描述", max_length=300)
    og_image: Optional[str] = Field(None, description="OG图片URL", max_length=500)


class SEORedirect(BaseModel):
    """URL重定向模型"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "old_slug": "old-post-name",
                "new_slug": "new-post-name",
                "redirect_type": 301,
                "hit_count": 42,
                "created_at": "2026-03-08T10:00:00"
            }
        }
    )
    
    old_slug: str = Field(..., description="旧URL标识")
    new_slug: str = Field(..., description="新URL标识")
    redirect_type: int = Field(default=301, description="301永久/302临时重定向")
    hit_count: int = Field(default=0, description="触发次数")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="创建时间")


# 预留扩展模型 (暂不实现)
class SEOMetadataExtended(SEOMetadata):
    """SEO元数据扩展模型 - 预留"""
    
    # 结构化数据 - 预留
    structured_data: Optional[dict] = Field(None, description="结构化数据(JSON-LD)")
    
    # Twitter Card - 预留
    twitter_card: Optional[dict] = Field(None, description="Twitter Card数据")
    
    # SEO评分 - 预留
    seo_score: Optional[int] = Field(None, description="SEO评分", ge=0, le=100)
    seo_suggestions: Optional[list] = Field(None, description="SEO建议列表")
