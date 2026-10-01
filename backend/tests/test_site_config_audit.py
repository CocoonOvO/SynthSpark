"""
站点配置审计接口的读数测试

`GET /api/admin/site-config/audit-logs` 的 `total` 是**符合条件的总条数**：
前端拿它算「共 N 条」「第 X / Y 页」。曾经这一行写成 `len(logs)`，也就是本页条数，
于是记录超过一页时两处读数都偏小（尾页除外）。

这里只碰配置库，所以自己搭 ASGI 客户端 + 覆盖超管依赖，不走 conftest 的 `client`
（那个依赖业务库，未配 TEST_DATABASE_URL 时会 skip，这处逻辑就没人看着了）。
"""
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.user import User
from app.routers import site_config as site_config_router
from app.routers.auth import get_current_active_superuser

AUDIT_URL = "/api/admin/site-config/audit-logs"


def _fake_superuser() -> User:
    """业务库超管的替身：本文件只验分页读数，与业务库无关"""
    return User(
        id="00000000-0000-0000-0000-0000000000ff",
        username="audit_tester",
        is_active=True,
        is_superuser=True,
        created_at=datetime.now(timezone.utc),
    )


@pytest_asyncio.fixture
async def audit_client(config_db_manager, monkeypatch):
    """把路由里的配置库换成临时库，并让超管依赖直接通过"""
    monkeypatch.setattr(site_config_router, "config_db_manager", config_db_manager)
    app.dependency_overrides[get_current_active_superuser] = _fake_superuser
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.pop(get_current_active_superuser, None)


def _seed(config_db_manager, count: int) -> None:
    for i in range(count):
        config_db_manager.add_site_config_audit_log(
            admin_id=f"00000000-0000-0000-0000-00000000000{i}",
            admin_username=f"boss_{i}",
            action="update",
            old_value={"site": {"name": f"old_{i}"}},
            new_value={"site": {"name": f"new_{i}"}},
            ip_address="127.0.0.1",
        )


@pytest.mark.asyncio
async def test_total_is_all_rows_while_logs_is_this_page(audit_client, config_db_manager):
    """12 条、每页 10 条：logs 给 10 条，total 必须给 12"""
    _seed(config_db_manager, 12)

    first = await audit_client.get(AUDIT_URL, params={"limit": 10, "offset": 0})
    assert first.status_code == 200
    body = first.json()
    assert len(body["logs"]) == 10  # 本页条数
    assert body["total"] == 12  # 总条数 —— 就是这次修掉的那一处
    # 倒序：第一页开头是新插入的那条
    assert body["logs"][0]["admin_username"] == "boss_11"

    second = await audit_client.get(AUDIT_URL, params={"limit": 10, "offset": 10})
    body = second.json()
    assert len(body["logs"]) == 2
    assert body["total"] == 12  # 翻页不该改变总条数


@pytest.mark.asyncio
async def test_total_is_zero_and_logs_empty_on_empty_table(audit_client):
    """空表：`total` 是 0、`logs` 是空数组，前端按它渲染「共 0 条 / 第 1 / 1 页」"""
    response = await audit_client.get(AUDIT_URL, params={"limit": 10, "offset": 0})
    assert response.status_code == 200
    assert response.json() == {"logs": [], "total": 0}
