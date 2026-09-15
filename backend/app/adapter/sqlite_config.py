"""
SQLite 配置库适配器
用于存储应用配置、数据库连接信息等
"""
import json
import sqlite3
from pathlib import Path
from typing import Any, Optional, Union
from contextlib import contextmanager

from .base import BaseAdapter


class SQLiteConfigAdapter(BaseAdapter):
    """
    SQLite 配置库适配器
    
    存储内容：
    - 数据库连接配置 (PostgreSQL URL)
    - 站点基础配置
    - 功能开关
    - JWT密钥等敏感配置
    """
    
    def __init__(self, db_path: str = "./config.db"):
        self.db_path = Path(db_path)
        self._connection: Optional[sqlite3.Connection] = None
    
    @contextmanager
    def _get_conn(self):
        """获取数据库连接上下文"""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    async def connect(self) -> None:
        """建立数据库连接（SQLite是文件数据库，这里确保目录存在）"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        # 测试连接
        with self._get_conn() as conn:
            conn.execute("SELECT 1")
    
    async def disconnect(self) -> None:
        """SQLite连接由上下文管理，无需显式关闭"""
        pass
    
    async def create_table(self, name: str) -> dict[str, Any]:
        """
        创建配置表
        
        配置表结构：
        - key: 配置键名 (主键)
        - value: 配置值 (JSON格式存储)
        - description: 配置说明
        - updated_at: 更新时间
        """
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    description TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        return {"success": True, "message": f"Table '{name}' created"}
    
    async def drop_table(self, name: str) -> dict[str, Any]:
        """删除表"""
        with self._get_conn() as conn:
            conn.execute(f"DROP TABLE IF EXISTS {name}")
        return {"success": True, "message": f"Table '{name}' dropped"}
    
    async def insert(self, table: str, data: Union[dict, Any]) -> dict[str, Any]:
        """
        插入配置项
        
        data格式: {"key": "config_key", "value": any, "description": "说明"}
        """
        if isinstance(data, dict):
            key = data.get("key")
            value = json.dumps(data.get("value"), ensure_ascii=False)
            description = data.get("description", "")
        else:
            key = getattr(data, "key", None)
            value = json.dumps(getattr(data, "value", None), ensure_ascii=False)
            description = getattr(data, "description", "")
        
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO config (key, value, description, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (key, value, description)
            )
        return {"success": True, "key": key}
    
    async def get(self, table: str, key: Union[str, int]) -> dict[str, Any]:
        """根据key获取配置值"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT key, value, description, updated_at FROM config WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            
            if row is None:
                return {"success": False, "error": f"Config key '{key}' not found"}
            
            return {
                "success": True,
                "data": {
                    "key": row["key"],
                    "value": json.loads(row["value"]),
                    "description": row["description"],
                    "updated_at": row["updated_at"]
                }
            }
    
    async def update(self, table: str, key: Union[str, int], data: dict) -> dict[str, Any]:
        """更新配置项"""
        value = json.dumps(data.get("value"), ensure_ascii=False) if "value" in data else None
        description = data.get("description")
        
        with self._get_conn() as conn:
            # 先检查是否存在
            cursor = conn.execute("SELECT 1 FROM config WHERE key = ?", (key,))
            if cursor.fetchone() is None:
                return {"success": False, "error": f"Config key '{key}' not found"}
            
            # 更新
            if value:
                conn.execute(
                    "UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
                    (value, key)
                )
            if description:
                conn.execute(
                    "UPDATE config SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
                    (description, key)
                )
        
        return {"success": True, "key": key}
    
    async def delete(self, table: str, key: Union[str, int]) -> dict[str, Any]:
        """删除配置项"""
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM config WHERE key = ?", (key,))
            if cursor.rowcount == 0:
                return {"success": False, "error": f"Config key '{key}' not found"}
        
        return {"success": True, "message": f"Config '{key}' deleted"}
    
    async def find(
        self,
        table: str,
        filters: Optional[dict] = None,
        limit: int = 100,
        offset: int = 0,
        sort_by: Optional[str] = None,
        sort_desc: bool = False
    ) -> dict[str, Any]:
        """查询配置项列表"""
        with self._get_conn() as conn:
            query = "SELECT key, value, description, updated_at FROM config"
            params = []
            
            # 简单的key前缀过滤
            if filters and "key_prefix" in filters:
                query += " WHERE key LIKE ?"
                params.append(f"{filters['key_prefix']}%")
            
            query += " ORDER BY key"
            query += f" LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            results = []
            for row in rows:
                results.append({
                    "key": row["key"],
                    "value": json.loads(row["value"]),
                    "description": row["description"],
                    "updated_at": row["updated_at"]
                })
            
            return {"success": True, "data": results, "count": len(results)}
    
    async def count(self, table: str, filters: Optional[dict] = None) -> dict[str, Any]:
        """统计配置项数量"""
        with self._get_conn() as conn:
            query = "SELECT COUNT(*) as count FROM config"
            params = []
            
            if filters and "key_prefix" in filters:
                query += " WHERE key LIKE ?"
                params.append(f"{filters['key_prefix']}%")
            
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            
            return {"success": True, "count": row["count"]}
    
    async def init_schema(self) -> None:
        """初始化配置库结构并设置默认值"""
        await self.create_table("config")
        
        # 默认配置
        default_configs = [
            {
                "key": "database_url",
                "value": "postgresql+asyncpg://user:password@localhost:5432/synthspark",
                "description": "PostgreSQL数据库连接URL"
            },
            {
                "key": "debug_mode",
                "value": False,
                "description": "调试模式开关"
            },
            {
                "key": "site_name",
                "value": "SynthSpark",
                "description": "站点名称"
            },
            {
                "key": "site_description",
                "value": "AI辅助博客站点",
                "description": "站点描述"
            },
            {
                "key": "secret_key",
                "value": "",
                "description": "JWT密钥（请修改）"
            },
            {
                "key": "maintenance_mode",
                "value": False,
                "description": "维护模式"
            },
        ]
        
        for config in default_configs:
            # 使用INSERT OR IGNORE避免覆盖已有配置
            with self._get_conn() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO config (key, value, description, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (config["key"], json.dumps(config["value"]), config["description"])
                )
    
    # ========== 配置库特有方法 ==========
    
    async def get_config(self, key: str, default: Any = None) -> Any:
        """获取配置值（简化版，直接返回值）"""
        result = await self.get("config", key)
        if result["success"]:
            return result["data"]["value"]
        return default

    async def set_config(self, key: str, value: Any, description: str = "") -> dict[str, Any]:
        """设置配置值（简化版）"""
        return await self.insert("config", {
            "key": key,
            "value": value,
            "description": description
        })

    async def search(
        self,
        query: str,
        search_type: str = "all",
        limit: int = 20,
        offset: int = 0
    ) -> dict[str, Any]:
        """
        全文搜索 - 配置库简单实现

        在配置库中搜索匹配的key或value
        """
        with self._get_conn() as conn:
            sql = """
                SELECT key, value, description, updated_at FROM config
                WHERE key LIKE ? OR value LIKE ? OR description LIKE ?
                ORDER BY key
                LIMIT ? OFFSET ?
            """
            search_pattern = f"%{query}%"
            cursor = conn.execute(sql, (search_pattern, search_pattern, search_pattern, limit, offset))
            rows = cursor.fetchall()

            results = []
            for row in rows:
                results.append({
                    "key": row["key"],
                    "value": json.loads(row["value"]),
                    "description": row["description"],
                    "updated_at": row["updated_at"]
                })

            return {"success": True, "data": results, "count": len(results)}
