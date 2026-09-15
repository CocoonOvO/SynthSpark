"""
配置库管理器
管理SQLite配置数据库的初始化、连接和操作
"""
import json
import sqlite3
import secrets
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Any, Dict
from contextlib import contextmanager

from .models import (
    ConfigAdmin, DatabaseConfig, SystemConfig, ConfigAuditLog,
    DEFAULT_SYSTEM_CONFIGS, DEFAULT_ADMIN, DatabaseType
)


class ConfigDBManager:
    """
    配置库管理器
    
    职责：
    1. 管理SQLite配置库的初始化和连接
    2. 提供配置库的所有CRUD操作
    3. 管理超管账号
    4. 管理数据库配置
    5. 管理系统配置
    6. 记录审计日志
    """
    
    _instance: Optional['ConfigDBManager'] = None
    
    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, db_path: str = "./config.db"):
        if self._initialized:
            return
        
        self.db_path = Path(db_path)
        self._initialized = False
    
    @contextmanager
    def _get_conn(self):
        """获取数据库连接上下文"""
        # 确保目录存在
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    
    async def initialize(self) -> None:
        """
        初始化配置库
        
        1. 创建所有表结构
        2. 插入默认超管账号
        3. 插入默认系统配置
        4. 生成JWT密钥
        """
        if self._initialized:
            return
        
        # 创建表结构
        self._create_tables()
        
        # 初始化默认数据
        self._init_default_data()
        
        self._initialized = True
    
    def _create_tables(self) -> None:
        """创建配置库表结构"""
        with self._get_conn() as conn:
            # 超管账号表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config_admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    is_default BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login_at TIMESTAMP,
                    last_login_ip TEXT
                )
            """)
            
            # 数据库配置表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS database_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL DEFAULT 'default',
                    db_type TEXT NOT NULL DEFAULT 'postgresql',
                    host TEXT DEFAULT 'localhost',
                    port INTEGER DEFAULT 5432,
                    database TEXT DEFAULT 'synthspark',
                    schema TEXT DEFAULT 'public',
                    username TEXT DEFAULT '',
                    password TEXT DEFAULT '',
                    url TEXT,
                    pool_size INTEGER DEFAULT 5,
                    max_overflow INTEGER DEFAULT 10,
                    pool_timeout INTEGER DEFAULT 30,
                    is_active BOOLEAN DEFAULT 0,
                    is_connected BOOLEAN DEFAULT 0,
                    last_connected_at TIMESTAMP,
                    connection_error TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 系统配置表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    value_type TEXT DEFAULT 'string',
                    description TEXT,
                    category TEXT DEFAULT 'general',
                    is_editable BOOLEAN DEFAULT 1,
                    is_secret BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 审计日志表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id INTEGER NOT NULL,
                    admin_username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT,
                    old_value TEXT,
                    new_value TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (admin_id) REFERENCES config_admins(id)
                )
            """)
            
            # 站点配置审计表（独立于配置库超管审计）
            # 站点配置操作方是业务库超管（UUID 主键），无法满足 config_audit_logs 的外键约束，
            # 故单独建表记录，admin_id 用 TEXT 容纳业务库用户 ID
            conn.execute("""
                CREATE TABLE IF NOT EXISTS site_config_audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_id TEXT NOT NULL,
                    admin_username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # 创建索引
            conn.execute("CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(key)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs(category)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON config_audit_logs(admin_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON config_audit_logs(created_at)")
    
    def _init_default_data(self) -> None:
        """初始化默认数据"""
        from ..utils.security import get_password_hash
        
        with self._get_conn() as conn:
            # 检查是否已有超管账号
            cursor = conn.execute("SELECT COUNT(*) as count FROM config_admins")
            if cursor.fetchone()["count"] == 0:
                # 创建默认超管账号
                password_hash = get_password_hash(DEFAULT_ADMIN["password"])
                conn.execute(
                    """
                    INSERT INTO config_admins (username, password_hash, is_active, is_default)
                    VALUES (?, ?, 1, 1)
                    """,
                    (DEFAULT_ADMIN["username"], password_hash)
                )
                # 记录安全警告日志
                print("[SECURITY WARNING] 已创建默认超管账号 admin / 123456")
                print("[SECURITY WARNING] 请立即登录并修改默认密码！")
            
            # 检查是否已有系统配置
            cursor = conn.execute("SELECT COUNT(*) as count FROM system_configs")
            if cursor.fetchone()["count"] == 0:
                # 插入默认系统配置
                for config in DEFAULT_SYSTEM_CONFIGS:
                    conn.execute(
                        """
                        INSERT INTO system_configs 
                        (key, value, value_type, description, category, is_editable, is_secret)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            config["key"],
                            json.dumps(config["value"], ensure_ascii=False),
                            config["value_type"],
                            config.get("description", ""),
                            config.get("category", "general"),
                            config.get("is_editable", True),
                            config.get("is_secret", False)
                        )
                    )
                
                # 生成随机JWT密钥
                jwt_secret = secrets.token_urlsafe(32)
                conn.execute(
                    """
                    UPDATE system_configs 
                    SET value = ?
                    WHERE key = 'jwt_secret_key'
                    """,
                    (json.dumps(jwt_secret),)
                )
    
    # ========== 超管账号管理 ==========
    
    def get_admin_by_username(self, username: str) -> Optional[ConfigAdmin]:
        """根据用户名获取超管账号"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT * FROM config_admins WHERE username = ?",
                (username,)
            )
            row = cursor.fetchone()
            
            if row is None:
                return None
            
            return ConfigAdmin(
                id=row["id"],
                username=row["username"],
                password_hash=row["password_hash"],
                is_active=bool(row["is_active"]),
                is_default=bool(row["is_default"]) if "is_default" in row.keys() else False,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_login_at=row["last_login_at"],
                last_login_ip=row["last_login_ip"]
            )

    def get_admin_by_id(self, admin_id: int) -> Optional[ConfigAdmin]:
        """根据ID获取超管账号"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT * FROM config_admins WHERE id = ?",
                (admin_id,)
            )
            row = cursor.fetchone()

            if row is None:
                return None

            return ConfigAdmin(
                id=row["id"],
                username=row["username"],
                password_hash=row["password_hash"],
                is_active=bool(row["is_active"]),
                is_default=bool(row["is_default"]) if "is_default" in row.keys() else False,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_login_at=row["last_login_at"],
                last_login_ip=row["last_login_ip"]
            )
    
    def update_admin_login(self, admin_id: int, ip: str) -> None:
        """更新超管登录信息"""
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE config_admins 
                SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (ip, admin_id)
            )
    
    def create_admin(self, username: str, password_hash: str) -> int:
        """创建超管账号"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                """
                INSERT INTO config_admins (username, password_hash, is_active)
                VALUES (?, ?, 1)
                """,
                (username, password_hash)
            )
            return cursor.lastrowid
    
    # ========== 数据库配置管理 ==========
    
    def get_database_config(self, name: str = "default") -> Optional[DatabaseConfig]:
        """获取数据库配置"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT * FROM database_configs WHERE name = ?",
                (name,)
            )
            row = cursor.fetchone()
            
            if row is None:
                return None
            
            return DatabaseConfig(
                id=row["id"],
                name=row["name"],
                db_type=DatabaseType(row["db_type"]),
                host=row["host"],
                port=row["port"],
                database=row["database"],
                db_schema=row["schema"] if "schema" in row.keys() else "public",
                username=row["username"],
                password=row["password"],
                url=row["url"],
                pool_size=row["pool_size"],
                max_overflow=row["max_overflow"],
                pool_timeout=row["pool_timeout"],
                is_active=bool(row["is_active"]),
                is_connected=bool(row["is_connected"]),
                last_connected_at=row["last_connected_at"],
                connection_error=row["connection_error"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            )
    
    def get_active_database_config(self) -> Optional[DatabaseConfig]:
        """获取启用的数据库配置"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT * FROM database_configs WHERE is_active = 1 LIMIT 1"
            )
            row = cursor.fetchone()
            
            if row is None:
                return None
            
            return DatabaseConfig(
                id=row["id"],
                name=row["name"],
                db_type=DatabaseType(row["db_type"]),
                host=row["host"],
                port=row["port"],
                database=row["database"],
                db_schema=row["schema"] if "schema" in row.keys() else "public",
                username=row["username"],
                password=row["password"],
                url=row["url"],
                pool_size=row["pool_size"],
                max_overflow=row["max_overflow"],
                pool_timeout=row["pool_timeout"],
                is_active=bool(row["is_active"]),
                is_connected=bool(row["is_connected"]),
                last_connected_at=row["last_connected_at"],
                connection_error=row["connection_error"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            )
    
    def save_database_config(self, config: DatabaseConfig) -> int:
        """保存数据库配置
        
        如果配置已存在（根据name判断），则更新；否则插入新记录。
        
        Args:
            config: 数据库配置对象
            
        Returns:
            配置ID
        """
        with self._get_conn() as conn:
            # 检查是否已存在同名配置
            existing = conn.execute(
                "SELECT id FROM database_configs WHERE name = ?",
                (config.name,)
            ).fetchone()
            
            if existing:
                # 更新现有配置
                config_id = existing[0]
                conn.execute(
                    """
                    UPDATE database_configs SET
                        db_type = ?, host = ?, port = ?, database = ?, schema = ?,
                        username = ?, password = ?, url = ?, pool_size = ?,
                        max_overflow = ?, pool_timeout = ?, is_active = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        config.db_type.value, config.host, config.port,
                        config.database, getattr(config, 'db_schema', 'public'),
                        config.username, config.password, config.url,
                        config.pool_size, config.max_overflow, config.pool_timeout,
                        config.is_active, config_id
                    )
                )
                return config_id
            elif config.id:
                # 更新指定ID的配置
                conn.execute(
                    """
                    UPDATE database_configs SET
                        name = ?, db_type = ?, host = ?, port = ?, database = ?, schema = ?,
                        username = ?, password = ?, url = ?, pool_size = ?,
                        max_overflow = ?, pool_timeout = ?, is_active = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        config.name, config.db_type.value, config.host, config.port,
                        config.database, getattr(config, 'db_schema', 'public'),
                        config.username, config.password, config.url,
                        config.pool_size, config.max_overflow, config.pool_timeout,
                        config.is_active, config.id
                    )
                )
                return config.id
            else:
                # 插入新配置
                cursor = conn.execute(
                    """
                    INSERT INTO database_configs 
                    (name, db_type, host, port, database, schema, username, password, url,
                     pool_size, max_overflow, pool_timeout, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config.name, config.db_type.value, config.host, config.port,
                        config.database, getattr(config, 'db_schema', 'public'),
                        config.username, config.password, config.url,
                        config.pool_size, config.max_overflow, config.pool_timeout,
                        config.is_active
                    )
                )
                return cursor.lastrowid
    
    def update_database_connection_status(
        self, config_id: int, is_connected: bool, error: Optional[str] = None
    ) -> None:
        """更新数据库连接状态"""
        with self._get_conn() as conn:
            if is_connected:
                conn.execute(
                    """
                    UPDATE database_configs 
                    SET is_connected = 1, last_connected_at = CURRENT_TIMESTAMP,
                        connection_error = NULL, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (config_id,)
                )
            else:
                conn.execute(
                    """
                    UPDATE database_configs 
                    SET is_connected = 0, connection_error = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (error, config_id)
                )
    
    def set_active_database(self, config_id: int) -> None:
        """设置启用的数据库配置"""
        with self._get_conn() as conn:
            # 先取消所有激活状态
            conn.execute("UPDATE database_configs SET is_active = 0")
            # 设置指定配置为激活
            conn.execute(
                "UPDATE database_configs SET is_active = 1 WHERE id = ?",
                (config_id,)
            )
    
    # ========== 系统配置管理 ==========
    
    def get_system_config(self, key: str) -> Optional[SystemConfig]:
        """获取系统配置"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT * FROM system_configs WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            
            if row is None:
                return None
            
            return self._row_to_system_config(row)
    
    def get_system_config_value(self, key: str, default: Any = None) -> Any:
        """获取系统配置值"""
        config = self.get_system_config(key)
        if config is None:
            return default
        return config.value
    
    def set_system_config(self, config: SystemConfig) -> None:
        """设置系统配置"""
        value_str = json.dumps(config.value, ensure_ascii=False)
        
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO system_configs 
                (key, value, value_type, description, category, is_editable, is_secret)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    value_type = excluded.value_type,
                    description = excluded.description,
                    category = excluded.category,
                    is_editable = excluded.is_editable,
                    is_secret = excluded.is_secret,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    config.key, value_str, config.value_type, config.description,
                    config.category, config.is_editable, config.is_secret
                )
            )
    
    def get_site_config(self) -> Optional[Dict]:
        """获取站点配置（未配置返回 None）—— value 是 json 类型

        站点配置以 system_configs 表的 key=site_config 存储，
        值为整份 JSON 对象（站点名/导航/页脚/首页与关于文案等）。
        """
        return self.get_system_config_value('site_config', None)

    def set_site_config(self, config: Dict) -> None:
        """保存站点配置（system_configs key=site_config, value_type=json）

        保存整份站点配置 JSON，供前端与超管后台交互式编辑使用。
        """
        # 构造系统配置项：json 类型，归入 site 分类，可编辑、非敏感
        site_config = SystemConfig(
            key='site_config',
            value=config,
            value_type='json',
            description='站点可配置项（站点名/导航/页脚/首页与关于文案）',
            category='site',
            is_editable=True,
            is_secret=False
        )
        self.set_system_config(site_config)

    def list_system_configs(
        self, category: Optional[str] = None, include_secret: bool = False
    ) -> List[SystemConfig]:
        """列出系统配置"""
        with self._get_conn() as conn:
            if category:
                cursor = conn.execute(
                    "SELECT * FROM system_configs WHERE category = ? ORDER BY key",
                    (category,)
                )
            else:
                cursor = conn.execute("SELECT * FROM system_configs ORDER BY category, key")
            
            configs = []
            for row in cursor.fetchall():
                if not include_secret and row["is_secret"]:
                    continue
                configs.append(self._row_to_system_config(row))
            
            return configs
    
    def _row_to_system_config(self, row: sqlite3.Row) -> SystemConfig:
        """将数据库行转换为SystemConfig对象"""
        value = json.loads(row["value"])
        
        # 根据类型转换值
        if row["value_type"] == "int":
            value = int(value)
        elif row["value_type"] == "float":
            value = float(value)
        elif row["value_type"] == "bool":
            value = bool(value)
        
        return SystemConfig(
            id=row["id"],
            key=row["key"],
            value=value,
            value_type=row["value_type"],
            description=row["description"],
            category=row["category"],
            is_editable=bool(row["is_editable"]),
            is_secret=bool(row["is_secret"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )
    
    # ========== 审计日志 ==========
    
    def add_audit_log(
        self, admin_id: int, admin_username: str, action: str,
        target_type: str, target_id: Optional[str] = None,
        old_value: Optional[Dict] = None, new_value: Optional[Dict] = None,
        ip_address: Optional[str] = None, user_agent: Optional[str] = None
    ) -> None:
        """添加审计日志"""
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO config_audit_logs 
                (admin_id, admin_username, action, target_type, target_id,
                 old_value, new_value, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    admin_id, admin_username, action, target_type, target_id,
                    json.dumps(old_value, ensure_ascii=False) if old_value else None,
                    json.dumps(new_value, ensure_ascii=False) if new_value else None,
                    ip_address, user_agent
                )
            )

    # ========== 站点配置审计（业务库超管操作） ==========

    def add_site_config_audit_log(
        self, admin_id: str, admin_username: str, action: str,
        old_value: Optional[Dict] = None, new_value: Optional[Dict] = None,
        ip_address: Optional[str] = None, user_agent: Optional[str] = None
    ) -> None:
        """
        添加站点配置审计日志

        站点配置操作方是业务库超管（UUID 主键），独立于配置库超管的
        config_audit_logs（其外键指向 config_admins），记入单独的表。
        """
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO site_config_audit_logs 
                (admin_id, admin_username, action, old_value, new_value, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    admin_id, admin_username, action,
                    json.dumps(old_value, ensure_ascii=False) if old_value else None,
                    json.dumps(new_value, ensure_ascii=False) if new_value else None,
                    ip_address, user_agent
                )
            )

    def get_site_config_audit_logs(
        self, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        查询站点配置审计日志（按时间倒序）
        """
        with self._get_conn() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM site_config_audit_logs
                ORDER BY id DESC LIMIT ? OFFSET ?
                """,
                (limit, offset)
            )
            logs = []
            for row in cursor.fetchall():
                log = dict(row)
                # 将 JSON 字符串还原为对象，方便接口直接返回
                for key in ("old_value", "new_value"):
                    if log.get(key):
                        try:
                            log[key] = json.loads(log[key])
                        except (ValueError, TypeError):
                            pass
                logs.append(log)
            return logs
    
    def get_audit_logs(
        self, admin_id: Optional[int] = None, limit: int = 50, offset: int = 0
    ) -> List[ConfigAuditLog]:
        """获取审计日志"""
        with self._get_conn() as conn:
            if admin_id:
                cursor = conn.execute(
                    """
                    SELECT * FROM config_audit_logs 
                    WHERE admin_id = ? 
                    ORDER BY created_at DESC 
                    LIMIT ? OFFSET ?
                    """,
                    (admin_id, limit, offset)
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT * FROM config_audit_logs 
                    ORDER BY created_at DESC 
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset)
                )
            
            logs = []
            for row in cursor.fetchall():
                logs.append(ConfigAuditLog(
                    id=row["id"],
                    admin_id=row["admin_id"],
                    admin_username=row["admin_username"],
                    action=row["action"],
                    target_type=row["target_type"],
                    target_id=row["target_id"],
                    old_value=row["old_value"],
                    new_value=row["new_value"],
                    ip_address=row["ip_address"],
                    user_agent=row["user_agent"],
                    created_at=row["created_at"]
                ))
            
            return logs
    
    # ========== 状态检查 ==========
    
    @property
    def is_initialized(self) -> bool:
        """检查配置库是否已初始化"""
        return self.db_path.exists()
    
    def has_database_config(self) -> bool:
        """检查是否已配置业务数据库"""
        with self._get_conn() as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) as count FROM database_configs WHERE is_active = 1"
            )
            return cursor.fetchone()["count"] > 0


# 全局配置库管理器实例
config_db_manager = ConfigDBManager()
