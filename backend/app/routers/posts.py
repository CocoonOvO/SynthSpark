"""
文章路由模块
处理文章的CRUD操作
"""
from datetime import datetime
from typing import Annotated, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db_manager import db_manager
from ..models.post import Post, PostCreate, PostUpdate, PostListItem, PostListResponse
from ..models.user import User
from .auth import get_current_active_user, get_current_active_superuser
from ..utils.slug import generate_slug, is_valid_slug

router = APIRouter()


async def get_existing_slugs(exclude_id: Optional[str] = None) -> List[str]:
    """获取所有已存在的slug列表"""
    try:
        # 使用find方法避免SQL拼接，通过filters查询非空slug
        result = await db_manager.db.find(
            "posts",
            filters={},
            limit=10000  # 获取所有文章
        )
        slugs = []
        if result.get("success") and result.get("data"):
            for row in result["data"]:
                slug = row.get("slug")
                row_id = str(row.get("id"))
                if slug and (exclude_id is None or row_id != exclude_id):
                    slugs.append(slug)
        return slugs
    except Exception as e:
        print(f"[get_existing_slugs] 错误: {e}")
        return []


async def get_post_with_details(post_id: str) -> Optional[Post]:
    """
    获取文章详情（包含作者名、标签、分组名）
    
    Args:
        post_id: 文章ID
    
    Returns:
        文章对象，如果不存在则返回None
    """
    result = await db_manager.db.get("posts", post_id)
    if not result.get("success"):
        return None

    post_data = result["data"]

    # 获取作者信息
    author_result = await db_manager.db.get("users", post_data["author_id"])
    if author_result.get("success"):
        author_data = author_result["data"]
        post_data["author_name"] = author_data.get("display_name") or author_data.get("username")
        post_data["author_username"] = author_data.get("username")  # 用户名用于跳转
        post_data["author_type"] = author_data.get("user_type", "user")
        post_data["author_avatar"] = author_data.get("avatar_url")
    else:
        post_data["author_name"] = "未知用户"
        post_data["author_username"] = "unknown"
        post_data["author_type"] = "user"
        post_data["author_avatar"] = None

    # 获取标签
    tags_result = await db_manager.db.get_post_tags(post_id)
    if tags_result.get("success"):
        post_data["tags"] = [tag["name"] for tag in tags_result["data"]]
    else:
        post_data["tags"] = []
    
    # 获取分组信息
    if post_data.get("group_id"):
        group_result = await db_manager.db.get("groups", post_data["group_id"])
        if group_result.get("success"):
            post_data["group_name"] = group_result["data"].get("name")
        else:
            post_data["group_name"] = None
    else:
        post_data["group_name"] = None
    
    return Post(**post_data)


async def get_post_list_item(post_data: dict) -> PostListItem:
    """
    将文章数据转换为列表项
    
    Args:
        post_data: 文章原始数据
    
    Returns:
        文章列表项
    """
    # 获取作者信息
    author_result = await db_manager.db.get("users", post_data["author_id"])
    if author_result.get("success"):
        author_data = author_result["data"]
        post_data["author_name"] = author_data.get("display_name") or author_data.get("username")
        post_data["author_username"] = author_data.get("username")  # 用户名用于跳转
        post_data["author_type"] = author_data.get("user_type", "user")
        post_data["author_avatar"] = author_data.get("avatar_url")
    else:
        post_data["author_name"] = "未知用户"
        post_data["author_username"] = "unknown"
        post_data["author_type"] = "user"
        post_data["author_avatar"] = None

    # 获取标签
    tags_result = await db_manager.db.get_post_tags(post_data["id"])
    if tags_result.get("success"):
        post_data["tags"] = [tag["name"] for tag in tags_result["data"]]
    else:
        post_data["tags"] = []

    # 获取分组信息
    if post_data.get("group_id"):
        group_result = await db_manager.db.get("groups", post_data["group_id"])
        if group_result.get("success"):
            post_data["group_name"] = group_result["data"].get("name")
        else:
            post_data["group_name"] = None
    else:
        post_data["group_name"] = None

    # 获取点赞数
    try:
        like_count_result = await db_manager.db.count(
            "likes",
            filters={"post_id": post_data["id"]}
        )
        post_data["like_count"] = like_count_result.get("count", 0)
    except Exception:
        post_data["like_count"] = 0

    return PostListItem(**post_data)


@router.get("/", response_model=PostListResponse, summary="获取文章列表")
async def list_posts(
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    group_id: Optional[str] = Query(None, description="按分组筛选"),
    tag: Optional[str] = Query(None, description="按标签筛选"),
    author_id: Optional[str] = Query(None, description="按作者筛选"),
    status: Optional[str] = Query("published", description="文章状态"),
    sort_by: str = Query("updated_at", description="排序字段"),
    sort_desc: bool = Query(True, description="是否降序")
) -> PostListResponse:
    """
    获取文章列表
    
    - 支持分页
    - 支持按分组、标签、作者筛选
    - 支持多种排序方式
    - 返回格式: {items: [...], total: N}
    """
    # 构建筛选条件
    filters = {}
    if status:
        filters["status"] = status
    if group_id:
        filters["group_id"] = group_id
    if author_id:
        filters["author_id"] = author_id
    
    # 查询文章总数
    count_result = await db_manager.db.count(
        "posts",
        filters=filters if filters else None
    )
    total = count_result.get("count", 0) if count_result.get("success") else 0
    
    # 查询文章
    result = await db_manager.db.find(
        "posts",
        filters=filters if filters else None,
        limit=limit,
        offset=skip,
        sort_by=sort_by,
        sort_desc=sort_desc
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取文章列表失败"
        )
    
    posts_data = result.get("data", [])
    
    # 如果按标签筛选，需要进一步过滤
    if tag:
        filtered_posts = []
        for post_data in posts_data:
            tags_result = await db_manager.db.get_post_tags(post_data["id"])
            if tags_result.get("success"):
                post_tags = [t["name"] for t in tags_result["data"]]
                if tag in post_tags:
                    filtered_posts.append(post_data)
        posts_data = filtered_posts
    
    # 转换为列表项
    posts = []
    for post_data in posts_data:
        try:
            post_item = await get_post_list_item(post_data)
            posts.append(post_item)
        except Exception:
            # 跳过无法解析的文章
            continue
    
    return PostListResponse(items=posts, total=total)


@router.get("/count", summary="获取文章数量")
async def count_posts(
    group_id: Optional[str] = Query(None, description="按分组筛选"),
    tag: Optional[str] = Query(None, description="按标签筛选"),
    status: Optional[str] = Query("published", description="文章状态")
) -> dict:
    """
    获取文章总数
    
    - 支持筛选条件统计
    """
    # 构建筛选条件
    filters = {}
    if status:
        filters["status"] = status
    if group_id:
        filters["group_id"] = group_id
    
    # 统计数量
    result = await db_manager.db.count(
        "posts",
        filters=filters if filters else None
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="统计文章数量失败"
        )
    
    count = result.get("count", 0)
    
    # 如果按标签筛选，需要进一步统计
    if tag:
        # 获取所有文章并统计包含该标签的数量
        all_posts_result = await db_manager.db.find(
            "posts",
            filters=filters if filters else None,
            limit=10000  # 获取所有文章
        )
        if all_posts_result.get("success"):
            count = 0
            for post_data in all_posts_result["data"]:
                tags_result = await db_manager.db.get_post_tags(post_data["id"])
                if tags_result.get("success"):
                    post_tags = [t["name"] for t in tags_result["data"]]
                    if tag in post_tags:
                        count += 1
    
    return {"count": count}


@router.get("/my", response_model=PostListResponse, summary="获取我的文章列表")
async def get_my_posts(
    current_user: Annotated[User, Depends(get_current_active_user)],
    skip: int = Query(0, ge=0, description="跳过数量"),
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    status: Optional[str] = Query(None, description="文章状态筛选")
) -> PostListResponse:
    """
    获取当前登录用户的文章列表
    
    - 需要登录
    - 支持分页
    - 可按状态筛选
    - 返回格式: {items: [...], total: N}
    """
    # 构建筛选条件
    filters = {"author_id": current_user.id}
    if status:
        filters["status"] = status
    
    # 查询文章总数
    count_result = await db_manager.db.count(
        "posts",
        filters=filters
    )
    total = count_result.get("count", 0) if count_result.get("success") else 0
    
    # 查询文章
    result = await db_manager.db.find(
        "posts",
        filters=filters,
        limit=limit,
        offset=skip,
        sort_by="created_at",
        sort_desc=True
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取文章列表失败"
        )
    
    posts_data = result.get("data", [])
    
    # 转换为列表项
    posts = []
    for post_data in posts_data:
        try:
            post_item = await get_post_list_item(post_data)
            posts.append(post_item)
        except Exception:
            # 跳过无法解析的文章
            continue
    
    return PostListResponse(items=posts, total=total)


@router.get("/{post_id}", response_model=Post, summary="获取文章详情")
async def get_post(
    post_id: str
) -> Post:
    """
    获取指定文章的详细内容
    
    - 返回完整文章内容
    - 增加浏览计数
    """
    post = await get_post_with_details(post_id)
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 增加浏览计数
    await db_manager.db.increment_view_count(post_id)
    
    return post


@router.get("/slug/{slug}", response_model=Post, summary="通过slug获取文章")
async def get_post_by_slug(
    slug: str
) -> Post:
    """
    通过slug获取文章详情
    
    - 返回完整文章内容
    - 增加浏览计数
    """
    # 查询文章 - 使用find方法避免SQL拼接
    result = await db_manager.db.find(
        "posts",
        filters={"slug": slug},
        limit=1
    )

    if not result.get("success") or not result.get("data") or len(result["data"]) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )

    post_id = str(result["data"][0]["id"])
    post = await get_post_with_details(post_id)
    
    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    # 增加浏览计数
    await db_manager.db.increment_view_count(post_id)
    
    return post


@router.post("/", response_model=Post, summary="创建文章", status_code=status.HTTP_201_CREATED)
async def create_post(
    post: PostCreate,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> Post:
    """
    创建新文章
    
    - 需要登录
    - 自动设置作者为当前用户
    - 默认状态为草稿
    """
    # 准备文章数据
    post_data = post.model_dump(exclude={"tags"})
    post_data["id"] = str(uuid4())
    post_data["author_id"] = current_user.id
    post_data["view_count"] = 0
    post_data["created_at"] = datetime.utcnow()
    post_data["updated_at"] = datetime.utcnow()
    
    # 处理slug：如果未提供则自动生成，确保唯一性
    if not post_data.get("slug"):
        # 从标题生成slug
        existing_slugs = await get_existing_slugs()
        post_data["slug"] = generate_slug(post_data["title"], existing_slugs)
    else:
        # 验证提供的slug格式
        if not is_valid_slug(post_data["slug"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="slug格式无效，只能包含小写字母、数字、中文和连字符"
            )
        # 检查唯一性
        existing_slugs = await get_existing_slugs()
        if post_data["slug"] in existing_slugs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"slug '{post_data['slug']}' 已存在"
            )
    
    # 如果状态为published，设置发布时间
    if post_data.get("status") == "published":
        post_data["published_at"] = datetime.utcnow()
    
    # 创建文章
    result = await db_manager.db.insert("posts", post_data)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建文章失败"
        )
    
    # 添加标签关联
    if post.tags:
        for tag_name in post.tags:
            # 查找或创建标签
            tag_result = await db_manager.db.find(
                "tags",
                filters={"name": tag_name},
                limit=1
            )

            if tag_result.get("data") and len(tag_result["data"]) > 0:
                tag_id = tag_result["data"][0]["id"]
            else:
                # 创建新标签
                tag_id = str(uuid4())
                await db_manager.db.insert("tags", {
                    "id": tag_id,
                    "name": tag_name,
                    "post_count": 0,
                    "created_at": datetime.utcnow()
                })

            # 添加文章-标签关联
            await db_manager.db.add_post_tag(post_data["id"], tag_id)

    # 更新分组使用计数
    if post_data.get("group_id"):
        group_count = await db_manager.db.count("posts", filters={"group_id": post_data["group_id"]})
        await db_manager.db.update(
            "groups",
            post_data["group_id"],
            # count() 返回 {"success", "count"}：不能把这个 dict 直接写进 int 列
            # （postgres 会 500，sqlite 只是默默存下垃圾）
            {"post_count": group_count.get("count", 0) if isinstance(group_count, dict) else group_count},
        )

    # 返回创建的文章
    created_post = await get_post_with_details(post_data["id"])
    return created_post


@router.put("/{post_id}", response_model=Post, summary="更新文章")
async def update_post(
    post_id: str,
    post_update: PostUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> Post:
    """
    更新指定文章
    
    - 作者或管理员可以修改
    - 支持部分更新
    """
    # 获取文章
    result = await db_manager.db.get("posts", post_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    post_data = result["data"]
    
    # 检查权限
    if post_data["author_id"] != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，只能修改自己的文章"
        )
    
    # 准备更新数据
    update_data = post_update.model_dump(exclude_unset=True, exclude={"tags"})

    if not update_data and post_update.tags is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="没有提供要更新的数据"
        )

    # 处理slug更新
    # 如果提供了slug，使用提供的slug；如果更新了标题且未提供slug，自动重新生成
    if "slug" in update_data and update_data["slug"]:
        # 验证slug格式
        if not is_valid_slug(update_data["slug"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="slug格式无效，只能包含小写字母、数字、中文和连字符"
            )
        # 检查唯一性（排除当前文章）
        existing_slugs = await get_existing_slugs(exclude_id=post_id)
        if update_data["slug"] in existing_slugs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"slug '{update_data['slug']}' 已存在"
            )
    elif "title" in update_data and update_data["title"]:
        # 更新了标题但未提供slug，自动重新生成slug
        existing_slugs = await get_existing_slugs(exclude_id=post_id)
        new_slug = generate_slug(update_data["title"], existing_slugs)
        update_data["slug"] = new_slug
    
    # 更新文章
    update_data["updated_at"] = datetime.utcnow()
    
    # 如果状态从draft变为published，设置发布时间
    if update_data.get("status") == "published" and post_data.get("status") == "draft":
        update_data["published_at"] = datetime.utcnow()
    
    update_result = await db_manager.db.update("posts", post_id, update_data)
    
    if not update_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新文章失败"
        )
    
    # 更新标签
    if post_update.tags is not None:
        # 获取当前标签
        current_tags_result = await db_manager.db.get_post_tags(post_id)
        current_tags = {}
        if current_tags_result.get("success"):
            current_tags = {tag["name"]: tag["id"] for tag in current_tags_result["data"]}
        
        # 删除旧标签关联
        for tag_name, tag_id in current_tags.items():
            await db_manager.db.remove_post_tag(post_id, tag_id)
        
        # 添加新标签关联
        for tag_name in post_update.tags:
            # 查找或创建标签
            tag_result = await db_manager.db.find(
                "tags",
                filters={"name": tag_name},
                limit=1
            )
            
            if tag_result.get("data") and len(tag_result["data"]) > 0:
                tag_id = tag_result["data"][0]["id"]
            else:
                # 创建新标签
                tag_id = str(uuid4())
                await db_manager.db.insert("tags", {
                    "id": tag_id,
                    "name": tag_name,
                    "created_at": datetime.utcnow()
                })
            
            # 添加文章-标签关联
            await db_manager.db.add_post_tag(post_id, tag_id)

    # 处理分组变更
    old_group_id = post_data.get("group_id")
    new_group_id = update_data.get("group_id")
    if new_group_id is not None and new_group_id != old_group_id:
        # 旧分组计数减1
        if old_group_id:
            old_count = await db_manager.db.count("posts", filters={"group_id": old_group_id})
            await db_manager.db.update(
                "groups",
                old_group_id,
                {"post_count": old_count.get("count", 0) if isinstance(old_count, dict) else old_count}
            )
        # 新分组计数加1
        if new_group_id:
            new_count = await db_manager.db.count("posts", filters={"group_id": new_group_id})
            await db_manager.db.update(
                "groups",
                new_group_id,
                {"post_count": new_count.get("count", 0) if isinstance(new_count, dict) else new_count}
            )

    # 返回更新后的文章
    updated_post = await get_post_with_details(post_id)
    return updated_post


@router.post("/{post_id}/unpublish", response_model=Post, summary="下架文章")
async def unpublish_post(
    post_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> Post:
    """
    将文章状态改为草稿（下架）

    - 作者或管理员可以操作
    - 文章将从前端列表中隐藏
    """
    # 获取文章
    result = await db_manager.db.get("posts", post_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )

    post_data = result["data"]

    # 检查权限
    if post_data["author_id"] != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，只能下架自己的文章"
        )

    # 更新状态为草稿
    update_data = {
        "status": "draft",
        "updated_at": datetime.utcnow()
    }

    update_result = await db_manager.db.update("posts", post_id, update_data)

    if not update_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="下架文章失败"
        )

    # 返回更新后的文章
    updated_post = await get_post_with_details(post_id)
    return updated_post


@router.delete("/{post_id}", summary="删除文章")
async def delete_post(
    post_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> dict:
    """
    删除指定文章
    
    - 作者或管理员可以删除
    """
    # 获取文章
    result = await db_manager.db.get("posts", post_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    post_data = result["data"]
    
    # 检查权限
    if post_data["author_id"] != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，只能删除自己的文章"
        )

    # 记录分组ID用于后续更新计数
    group_id = post_data.get("group_id")

    # 删除文章（关联的标签关联会自动删除，标签计数会自动更新）
    delete_result = await db_manager.db.delete("posts", post_id)

    if not delete_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除文章失败"
        )

    # 更新分组使用计数
    if group_id:
        group_count = await db_manager.db.count("posts", filters={"group_id": group_id})
        await db_manager.db.update(
            "groups",
            group_id,
            {"post_count": group_count.get("count", 0) if isinstance(group_count, dict) else group_count},
        )

    return {"success": True, "message": "文章已删除"}


@router.post("/{post_id}/publish", response_model=Post, summary="发布文章")
async def publish_post(
    post_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)]
) -> Post:
    """
    将文章状态改为已发布
    
    - 作者或管理员可以操作
    - 记录发布时间
    """
    # 获取文章
    result = await db_manager.db.get("posts", post_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文章不存在"
        )
    
    post_data = result["data"]
    
    # 检查权限
    if post_data["author_id"] != current_user.id and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，只能发布自己的文章"
        )
    
    # 更新状态为已发布
    update_data = {
        "status": "published",
        "updated_at": datetime.utcnow()
    }
    
    # 如果之前未发布过，设置发布时间
    if not post_data.get("published_at"):
        update_data["published_at"] = datetime.utcnow()
    
    update_result = await db_manager.db.update("posts", post_id, update_data)
    
    if not update_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="发布文章失败"
        )
    
    # 返回更新后的文章
    updated_post = await get_post_with_details(post_id)
    return updated_post
