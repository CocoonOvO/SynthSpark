"""
站点配置路由模块

为超管后台「站点配置」交互式编辑提供存储与接口：
- GET /site-config         公开读取（前端启动依赖，绝不 500）
- GET /admin/site-config    超管读取当前保存值（业务库超管，供管理页加载）
- PUT /admin/site-config    超管保存整份配置 JSON（业务库超管）

存储位置：config.db（SQLite 配置库）system_configs 表，key=site_config。
鉴权说明：写接口复用业务库超管（get_current_active_superuser），
与 links.py 一致（前端管理入口是业务库登录态），而非配置库超管。
"""
import json
from typing import Annotated, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..config import get_settings
from ..config_db import config_db_manager
from ..models.user import User
from .admin import get_client_ip
from .auth import get_current_active_superuser

router = APIRouter()

# 站点配置序列化后的最大字节数（100KB），防止写入超大配置
MAX_SITE_CONFIG_SIZE = 100 * 1024


def _load_site_config() -> Dict[str, Any]:
    """
    读取当前保存的站点配置

    未保存或读取异常时返回空字典，保证前端可用（绝不抛 500）。
    """
    try:
        config = config_db_manager.get_site_config()
    except Exception:
        return {}
    # 防御：存储值非 dict 时视为未配置
    if not isinstance(config, dict):
        return {}
    return config


@router.get("/site-config", summary="获取站点配置（公开）")
async def get_site_config_public() -> Dict[str, Any]:
    """
    获取站点配置（公开，无鉴权）

    返回 config.db 中保存的配置 dict；未保存或异常时返回 {}。
    前端启动依赖此接口，必须保证不 500。
    """
    return _load_site_config()


@router.get("/admin/site-config", summary="获取站点配置（超管）")
async def get_site_config_admin(
    current_user: Annotated[User, Depends(get_current_active_superuser)]
) -> Dict[str, Any]:
    """
    获取当前保存的站点配置（仅业务库超管）

    与公开 GET 同逻辑，供管理页编辑时加载当前值。
    """
    return _load_site_config()


@router.get("/admin/site-config/audit-logs", summary="查询站点配置审计日志（超管）")
async def get_site_config_audit_logs(
    limit: int = 50,
    offset: int = 0,
    current_user: Annotated[User, Depends(get_current_active_superuser)] = None
) -> Dict[str, Any]:
    """
    查询站点配置操作审计日志（仅业务库超管）

    记录每次站点配置的保存操作（操作人、时间、变更前后值）。

    `total` 是**符合条件的总条数**（另走一次 COUNT），不是本页条数 —— 前端按它算
    「共 N 条」「第 X / Y 页」，写成 `len(logs)` 会让这两处读数都偏小。
    """
    logs = config_db_manager.get_site_config_audit_logs(limit=limit, offset=offset)
    total = config_db_manager.count_site_config_audit_logs()
    return {"logs": logs, "total": total}


@router.put("/admin/site-config", summary="保存站点配置（超管）")
async def update_site_config(
    request: Request,
    payload: Dict[str, Any],
    current_user: Annotated[User, Depends(get_current_active_superuser)]
) -> Dict[str, Any]:
    """
    保存整份站点配置 JSON（仅业务库超管）

    - body 必须是非空 JSON 对象（空对象返回 400）
    - 序列化后超过 100KB 返回 413
    - 键结构不强制校验（前端表单保证结构）
    - 保存后记录审计日志（目标类型 site_config）
    """
    settings = get_settings()
    try:
        # 空 body / 空对象直接拒绝
        if not isinstance(payload, dict) or not payload:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请求体必须是非空 JSON 对象"
            )

        # 大小限制：序列化后超过 100KB 拒绝
        size = len(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
        if size > MAX_SITE_CONFIG_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="站点配置过大（超过 100KB）"
            )

        # 保存前读取旧值，用于审计
        old_value = _load_site_config() or None

        # 保存整份配置（key=site_config, value_type=json）
        config_db_manager.set_site_config(payload)

        # 记录审计日志（站点配置独立审计表，业务库用户 id 不受配置库外键约束）
        config_db_manager.add_site_config_audit_log(
            admin_id=str(current_user.id),
            admin_username=current_user.username,
            action="update",
            old_value=old_value,
            new_value=payload,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent")
        )

        return {"success": True, "message": "站点配置已保存"}
    except HTTPException:
        raise
    except Exception as e:
        # debug 模式返回详细错误，生产只返回通用错误
        if settings.DEBUG_MODE:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "message": "服务器内部错误",
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "服务器内部错误"}
        )
