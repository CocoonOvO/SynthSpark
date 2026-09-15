"""
配置库单元测试
测试配置库的初始化、超管账号、数据库配置、系统配置等功能
"""
import pytest
from pathlib import Path


class TestConfigDBInitialization:
    """测试配置库初始化"""
    
    @pytest.mark.asyncio
    async def test_config_db_initialization(self, config_db_manager, temp_db_path):
        """测试配置库初始化"""
        # 验证数据库文件已创建
        assert Path(temp_db_path).exists()
        
        # 验证已初始化标志
        assert config_db_manager._initialized is True
        assert config_db_manager.is_initialized is True
    
    @pytest.mark.asyncio
    async def test_default_admin_created(self, config_db_manager):
        """测试默认超管账号已创建"""
        admin = config_db_manager.get_admin_by_username("admin")
        
        assert admin is not None
        assert admin.username == "admin"
        assert admin.is_active is True
        assert admin.id == 1
    
    @pytest.mark.asyncio
    async def test_default_system_configs_created(self, config_db_manager):
        """测试默认系统配置已创建"""
        # 检查一些关键配置项
        site_name = config_db_manager.get_system_config("site_name")
        assert site_name is not None
        assert site_name.value == "SynthSpark"
        
        jwt_secret = config_db_manager.get_system_config("jwt_secret_key")
        assert jwt_secret is not None
        assert jwt_secret.value != ""  # 应该已生成随机密钥
        assert len(jwt_secret.value) > 0
    
    @pytest.mark.asyncio
    async def test_has_database_config_initially_false(self, config_db_manager):
        """测试初始状态没有数据库配置"""
        assert config_db_manager.has_database_config() is False


class TestConfigAdmin:
    """测试超管账号管理"""
    
    @pytest.mark.asyncio
    async def test_get_admin_by_username(self, config_db_manager):
        """测试通过用户名获取超管"""
        admin = config_db_manager.get_admin_by_username("admin")
        
        assert admin is not None
        assert admin.username == "admin"
        assert admin.id == 1
    
    @pytest.mark.asyncio
    async def test_get_admin_by_id(self, config_db_manager):
        """测试通过ID获取超管"""
        admin = config_db_manager.get_admin_by_id(1)
        
        assert admin is not None
        assert admin.username == "admin"
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_admin(self, config_db_manager):
        """测试获取不存在的超管"""
        admin = config_db_manager.get_admin_by_username("nonexistent")
        assert admin is None
        
        admin = config_db_manager.get_admin_by_id(999)
        assert admin is None
    
    @pytest.mark.asyncio
    async def test_update_admin_login(self, config_db_manager):
        """测试更新超管登录信息"""
        config_db_manager.update_admin_login(1, "127.0.0.1")
        
        admin = config_db_manager.get_admin_by_id(1)
        assert admin.last_login_ip == "127.0.0.1"
        assert admin.last_login_at is not None


class TestDatabaseConfig:
    """测试数据库配置管理"""
    
    @pytest.mark.asyncio
    async def test_save_database_config(self, config_db_manager):
        """测试保存数据库配置"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="default",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="test_db",
            username="test_user",
            password="test_pass",
            is_active=True
        )
        
        config_id = config_db_manager.save_database_config(config)
        assert config_id > 0
        
        # 验证配置已保存
        saved_config = config_db_manager.get_database_config("default")
        assert saved_config is not None
        assert saved_config.host == "localhost"
        assert saved_config.database == "test_db"
        assert saved_config.username == "test_user"
    
    @pytest.mark.asyncio
    async def test_get_active_database_config(self, config_db_manager):
        """测试获取激活的数据库配置"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        # 初始状态应该没有激活配置
        active_config = config_db_manager.get_active_database_config()
        assert active_config is None
        
        # 创建配置
        config = DatabaseConfig(
            name="default",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="test_db",
            username="test_user",
            password="test_pass",
            is_active=True
        )
        
        config_id = config_db_manager.save_database_config(config)
        config_db_manager.set_active_database(config_id)
        
        # 现在应该有激活配置
        active_config = config_db_manager.get_active_database_config()
        assert active_config is not None
        assert active_config.is_active is True
    
    @pytest.mark.asyncio
    async def test_set_active_database(self, config_db_manager):
        """测试设置激活的数据库"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        # 创建两个配置
        config1 = DatabaseConfig(
            name="db1",
            db_type=DatabaseType.POSTGRESQL,
            host="host1",
            port=5432,
            database="db1",
            username="user1",
            password="pass1",
            is_active=True
        )
        
        config2 = DatabaseConfig(
            name="db2",
            db_type=DatabaseType.POSTGRESQL,
            host="host2",
            port=5432,
            database="db2",
            username="user2",
            password="pass2",
            is_active=False
        )
        
        id1 = config_db_manager.save_database_config(config1)
        id2 = config_db_manager.save_database_config(config2)
        
        # 设置第二个为激活
        config_db_manager.set_active_database(id2)
        
        active = config_db_manager.get_active_database_config()
        assert active is not None
        assert active.id == id2
        assert active.host == "host2"
    
    @pytest.mark.asyncio
    async def test_update_database_connection_status(self, config_db_manager):
        """测试更新数据库连接状态"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="default",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="test_db",
            username="test_user",
            password="test_pass",
            is_active=True
        )
        
        config_id = config_db_manager.save_database_config(config)
        
        # 更新为连接成功
        config_db_manager.update_database_connection_status(config_id, True)
        
        saved = config_db_manager.get_database_config("default")
        assert saved.is_connected is True
        assert saved.connection_error is None
        assert saved.last_connected_at is not None
        
        # 更新为连接失败
        config_db_manager.update_database_connection_status(
            config_id, False, "Connection refused"
        )
        
        saved = config_db_manager.get_database_config("default")
        assert saved.is_connected is False
        assert saved.connection_error == "Connection refused"


class TestSystemConfig:
    """测试系统配置管理"""
    
    @pytest.mark.asyncio
    async def test_get_system_config(self, config_db_manager):
        """测试获取系统配置"""
        config = config_db_manager.get_system_config("site_name")
        
        assert config is not None
        assert config.key == "site_name"
        assert config.value == "SynthSpark"
        assert config.value_type == "string"
    
    @pytest.mark.asyncio
    async def test_get_system_config_value(self, config_db_manager):
        """测试获取系统配置值"""
        value = config_db_manager.get_system_config_value("site_name")
        assert value == "SynthSpark"
        
        # 测试默认值
        value = config_db_manager.get_system_config_value(
            "nonexistent_key", "default_value"
        )
        assert value == "default_value"
    
    @pytest.mark.asyncio
    async def test_set_system_config(self, config_db_manager):
        """测试设置系统配置"""
        from app.config_db import SystemConfig
        
        # 更新现有配置
        config = SystemConfig(
            key="site_name",
            value="New Site Name",
            value_type="string",
            description="Updated site name",
            category="site"
        )
        
        config_db_manager.set_system_config(config)
        
        # 验证更新
        saved = config_db_manager.get_system_config("site_name")
        assert saved.value == "New Site Name"
        assert saved.description == "Updated site name"
    
    @pytest.mark.asyncio
    async def test_list_system_configs(self, config_db_manager):
        """测试列出系统配置"""
        configs = config_db_manager.list_system_configs()
        
        # 应该有默认配置
        assert len(configs) > 0
        
        # 按分类筛选
        site_configs = config_db_manager.list_system_configs(category="site")
        assert len(site_configs) > 0
        for config in site_configs:
            assert config.category == "site"


class TestAuditLog:
    """测试审计日志"""
    
    @pytest.mark.asyncio
    async def test_add_audit_log(self, config_db_manager):
        """测试添加审计日志"""
        config_db_manager.add_audit_log(
            admin_id=1,
            admin_username="admin",
            action="test_action",
            target_type="test_target",
            target_id="123",
            old_value={"key": "old"},
            new_value={"key": "new"},
            ip_address="127.0.0.1",
            user_agent="TestAgent"
        )
        
        # 获取日志
        logs = config_db_manager.get_audit_logs(limit=10)
        assert len(logs) == 1
        
        log = logs[0]
        assert log.admin_id == 1
        assert log.admin_username == "admin"
        assert log.action == "test_action"
        assert log.target_type == "test_target"
        assert log.ip_address == "127.0.0.1"
    
    @pytest.mark.asyncio
    async def test_get_audit_logs_by_admin(self, config_db_manager):
        """测试按管理员获取审计日志"""
        # 添加多条日志
        for i in range(3):
            config_db_manager.add_audit_log(
                admin_id=1,
                admin_username="admin",
                action=f"action_{i}",
                target_type="test"
            )
        
        logs = config_db_manager.get_audit_logs(admin_id=1, limit=10)
        assert len(logs) == 3


class TestConfigAdminAuth:
    """测试超管认证"""
    
    @pytest.mark.asyncio
    async def test_authenticate_admin_success(self, config_db_manager):
        """测试超管认证成功"""
        from app.config_db.auth import ConfigAdminAuth
        
        auth = ConfigAdminAuth()
        admin = auth.authenticate_admin("admin", "123456")
        
        assert admin is not None
        assert admin.username == "admin"
    
    @pytest.mark.asyncio
    async def test_authenticate_admin_wrong_password(self, config_db_manager):
        """测试超管认证失败 - 错误密码"""
        from app.config_db.auth import ConfigAdminAuth
        
        auth = ConfigAdminAuth()
        admin = auth.authenticate_admin("admin", "wrong_password")
        
        assert admin is None
    
    @pytest.mark.asyncio
    async def test_authenticate_admin_nonexistent(self, config_db_manager):
        """测试超管认证失败 - 用户不存在"""
        from app.config_db.auth import ConfigAdminAuth
        
        auth = ConfigAdminAuth()
        admin = auth.authenticate_admin("nonexistent", "123456")
        
        assert admin is None
    
    @pytest.mark.asyncio
    async def test_create_and_verify_token(self, config_db_manager):
        """测试创建和验证令牌"""
        from app.config_db.auth import ConfigAdminAuth
        
        auth = ConfigAdminAuth()
        
        # 创建令牌
        token = auth.create_access_token(admin_id=1, username="admin")
        assert token is not None
        assert isinstance(token, str)
        
        # 验证令牌
        payload = auth.decode_token(token)
        assert payload is not None
        assert payload["sub"] == "1"
        assert payload["username"] == "admin"
        assert payload["type"] == "config_admin"
    
    @pytest.mark.asyncio
    async def test_decode_invalid_token(self, config_db_manager):
        """测试验证无效令牌"""
        from app.config_db.auth import ConfigAdminAuth
        
        auth = ConfigAdminAuth()
        
        # 验证无效令牌
        payload = auth.decode_token("invalid_token")
        assert payload is None
