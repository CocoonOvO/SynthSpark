/**
 * 本文件由 openapi-typescript 生成，请勿手改。
 * 生成：npm run api:gen      校验：npm run api:check
 * 契约来源：http://localhost:8002/api/openapi.json
 * 契约摘要：63 paths / 89 operations / 50 schemas
 * 契约指纹：sha256:e0e2c9de46d56c0f
 */

export interface paths {
    "/api/auth/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 用户登录
         * @description 使用用户名和密码获取访问令牌
         */
        post: operations["login_for_access_token_api_auth_token_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 刷新令牌
         * @description 使用刷新令牌获取新的访问令牌
         */
        post: operations["refresh_access_token_api_auth_refresh_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 用户注册
         * @description 注册新用户账号，需要超管权限
         */
        post: operations["register_user_api_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 用户登出
         * @description 使当前访问令牌失效
         */
        post: operations["logout_user_api_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 修改密码
         * @description 修改当前用户密码
         */
        post: operations["reset_password_api_auth_password_reset_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取当前用户信息
         * @description 获取当前登录用户的详细信息
         */
        get: operations["get_current_user_info_api_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取当前用户信息
         * @description 获取当前登录用户的详细信息
         */
        get: operations["read_users_me_api_users_me_get"];
        /**
         * 更新当前用户信息
         * @description 更新当前登录用户的信息
         *
         *     - 支持更新：邮箱、显示名称、头像、简介
         *     - 不支持修改：用户名
         */
        put: operations["update_user_me_api_users_me_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取用户列表
         * @description 获取用户列表（管理员权限）
         *
         *     - 支持分页
         *     - 仅管理员可访问
         *
         *     BUG-039修复: 将列表路由放在动态路由之前，避免路径匹配冲突
         */
        get: operations["list_users_api_users__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/by-username/{username}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 通过用户名获取用户信息
         * @description 通过用户名获取指定用户的公开信息
         *
         *     - 公开接口，无需登录即可访问
         *     - 返回用户的基本公开信息
         *     - 敏感字段（邮箱、状态等）已过滤
         */
        get: operations["read_user_by_username_api_users_by_username__username__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取指定用户信息
         * @description 获取指定用户的公开信息
         *
         *     - 公开接口，无需登录即可访问
         *     - 返回用户的基本公开信息
         *     - 敏感字段（邮箱、状态等）已过滤
         */
        get: operations["read_user_api_users__user_id__get"];
        put?: never;
        post?: never;
        /**
         * 删除用户
         * @description 删除指定用户（管理员权限或用户本人）
         *
         *     - 用户可以删除自己的账号
         *     - 管理员可以删除任何账号
         */
        delete: operations["delete_user_api_users__user_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文章列表
         * @description 获取文章列表
         *
         *     - 支持分页
         *     - 支持按分组、标签、作者筛选
         *     - 支持多种排序方式
         *     - 返回格式: {items: [...], total: N}
         */
        get: operations["list_posts_api_posts__get"];
        put?: never;
        /**
         * 创建文章
         * @description 创建新文章
         *
         *     - 需要登录
         *     - 自动设置作者为当前用户
         *     - 默认状态为草稿
         */
        post: operations["create_post_api_posts__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文章数量
         * @description 获取文章总数
         *
         *     - 支持筛选条件统计
         */
        get: operations["count_posts_api_posts_count_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/my": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取我的文章列表
         * @description 获取当前登录用户的文章列表
         *
         *     - 需要登录
         *     - 支持分页
         *     - 可按状态筛选
         *     - 返回格式: {items: [...], total: N}
         */
        get: operations["get_my_posts_api_posts_my_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{post_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文章详情
         * @description 获取指定文章的详细内容
         *
         *     - 返回完整文章内容
         *     - 增加浏览计数
         */
        get: operations["get_post_api_posts__post_id__get"];
        /**
         * 更新文章
         * @description 更新指定文章
         *
         *     - 作者或管理员可以修改
         *     - 支持部分更新
         */
        put: operations["update_post_api_posts__post_id__put"];
        post?: never;
        /**
         * 删除文章
         * @description 删除指定文章
         *
         *     - 作者或管理员可以删除
         */
        delete: operations["delete_post_api_posts__post_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/slug/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 通过slug获取文章
         * @description 通过slug获取文章详情
         *
         *     - 返回完整文章内容
         *     - 增加浏览计数
         */
        get: operations["get_post_by_slug_api_posts_slug__slug__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{post_id}/unpublish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 下架文章
         * @description 将文章状态改为草稿（下架）
         *
         *     - 作者或管理员可以操作
         *     - 文章将从前端列表中隐藏
         */
        post: operations["unpublish_post_api_posts__post_id__unpublish_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{post_id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 发布文章
         * @description 将文章状态改为已发布
         *
         *     - 作者或管理员可以操作
         *     - 记录发布时间
         */
        post: operations["publish_post_api_posts__post_id__publish_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tags/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取标签列表
         * @description 获取所有标签列表
         *
         *     - 按使用数量排序
         */
        get: operations["list_tags_api_tags__get"];
        put?: never;
        /**
         * 创建标签
         * @description 创建新标签
         *
         *     - 需要登录
         *     - 标签名不能重复
         */
        post: operations["create_tag_api_tags__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tags/{tag_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取标签详情
         * @description 获取指定标签的详细信息
         */
        get: operations["get_tag_api_tags__tag_id__get"];
        /**
         * 更新标签
         * @description 更新标签信息
         *
         *     - 需要登录
         */
        put: operations["update_tag_api_tags__tag_id__put"];
        post?: never;
        /**
         * 删除标签
         * @description 删除指定标签
         *
         *     - 需要登录
         *     - 标签被使用时无法删除
         */
        delete: operations["delete_tag_api_tags__tag_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/groups/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取分组列表
         * @description 获取所有分组列表
         *
         *     - 按排序顺序返回
         */
        get: operations["list_groups_api_groups__get"];
        put?: never;
        /**
         * 创建分组
         * @description 创建新分组
         *
         *     - 需要登录
         *     - 分组名不能重复
         */
        post: operations["create_group_api_groups__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/groups/{group_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取分组详情
         * @description 获取指定分组的详细信息
         */
        get: operations["get_group_api_groups__group_id__get"];
        /**
         * 更新分组
         * @description 更新分组信息
         *
         *     - 需要登录
         */
        put: operations["update_group_api_groups__group_id__put"];
        post?: never;
        /**
         * 删除分组
         * @description 删除指定分组
         *
         *     - 需要登录
         *     - 分组被使用时无法删除
         */
        delete: operations["delete_group_api_groups__group_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/groups/reorder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 重新排序分组
         * @description 批量更新分组排序
         *
         *     - 需要登录
         *     - 接收分组ID和排序值的映射，例如：{"group_id_1": 0, "group_id_2": 1}
         */
        post: operations["reorder_groups_api_groups_reorder_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/upload/image": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 上传图片
         * @description 上传图片文件
         *
         *     - 支持格式: jpg, png, gif, webp
         *     - 最大 10MB
         *     - 保存到用户专属目录
         *     - 返回可访问的URL
         */
        post: operations["upload_image_api_upload_image_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/upload/avatar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 上传头像
         * @description 上传用户头像
         *
         *     - 支持格式: jpg, png, gif, webp
         *     - 建议尺寸: 200x200
         *     - 自动裁剪/压缩
         *     - 覆盖旧头像
         */
        post: operations["upload_avatar_api_upload_avatar_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/upload/attachment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 上传附件
         * @description 上传附件文件
         *
         *     - 支持格式: pdf, markdown, 图片
         *     - 最大 10MB
         */
        post: operations["upload_attachment_api_upload_attachment_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/download/{user_id}/{file_type}/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文件
         * @description 获取上传的文件
         *
         *     - 公开访问
         *     - 支持图片和附件
         */
        get: operations["get_file_api_download__user_id___file_type___filename__get"];
        put?: never;
        post?: never;
        /**
         * 删除文件
         * @description 删除上传的文件
         *
         *     - 需要登录
         *     - 只能删除自己的文件（超管除外）
         */
        delete: operations["delete_file_api_download__user_id___file_type___filename__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 超管登录
         * @description 使用配置库超管账号登录，获取访问令牌。默认账号: admin，默认密码: 123456
         */
        post: operations["admin_login_api_admin_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/setup-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取项目设置状态
         * @description 公开接口，用于前端判断项目是否已初始化。无需认证。
         */
        get: operations["get_setup_status_api_admin_setup_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 超管登出
         * @description 记录登出日志（令牌仍有效至过期）
         */
        post: operations["admin_logout_api_admin_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取当前超管信息
         * @description 获取当前登录超管的详细信息
         */
        get: operations["get_current_admin_info_api_admin_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取当前数据库配置
         * @description 获取当前激活的数据库配置信息
         */
        get: operations["get_database_config_api_admin_database_get"];
        put?: never;
        /**
         * 创建或更新数据库配置
         * @description 配置业务数据库连接信息。如果同名配置已存在则更新，否则创建新配置。
         */
        post: operations["create_database_config_api_admin_database_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 测试数据库连接
         * @description 测试数据库连接是否可用。公开接口，无需认证。
         */
        post: operations["test_database_connection_api_admin_database_test_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database/connect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 手动触发数据库连接
         * @description 用于配置数据库后手动建立连接
         */
        post: operations["connect_database_api_admin_database_connect_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/configs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 列出系统配置
         * @description 获取所有系统配置项。敏感配置会被遮盖。
         */
        get: operations["list_system_configs_api_admin_configs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/configs/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取单个系统配置
         * @description 根据配置键获取单个系统配置
         */
        get: operations["get_system_config_api_admin_configs__key__get"];
        /**
         * 更新系统配置
         * @description 更新指定键的系统配置值
         */
        put: operations["update_system_config_api_admin_configs__key__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取审计日志
         * @description 查看配置库的操作历史记录
         */
        get: operations["get_audit_logs_api_admin_audit_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database/init-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取数据库初始化状态
         * @description 检查业务数据库和表结构是否已初始化
         */
        get: operations["get_database_init_status_api_admin_database_init_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database/init": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 初始化数据库
         * @description 创建业务数据库和表结构（如果不存在）
         */
        post: operations["init_database_endpoint_api_admin_database_init_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/init-wizard/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 完成初始化向导
         * @description 一步完成数据库配置、连接测试和业务库初始化
         */
        post: operations["complete_init_wizard_api_admin_init_wizard_complete_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/database/switch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 切换数据库
         * @description 切换到新的数据库（不迁移数据）。可以指定新的数据库名和schema，会自动创建并初始化。
         */
        post: operations["switch_database_api_admin_database_switch_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 创建评论
         * @description 创建评论或回复
         *
         *     - 普通评论：不指定parent_id
         *     - 回复评论：指定parent_id为要回复的评论ID
         *     - 最多支持3层嵌套回复
         *     - 已登录用户直接评论；未登录用户匿名评论，需提供 author_name（邮箱可选）
         *     - 匿名评论受 IP 限流约束（每日上限 + 最小间隔）
         */
        post: operations["create_comment_api_comments_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文章评论列表
         * @description 获取文章的评论列表（通过Query参数）
         *
         *     - 返回顶层评论及其嵌套回复
         *     - 支持分页（仅对顶层评论分页）
         *     - 最多返回3层嵌套回复
         */
        get: operations["get_post_comments_by_query_api_comments__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments/post/{post_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取文章评论列表
         * @description 获取文章的评论列表（树形结构，路径参数版本）
         *
         *     - 返回顶层评论及其嵌套回复
         *     - 支持分页（仅对顶层评论分页）
         *     - 最多返回3层嵌套回复
         */
        get: operations["get_post_comments_api_comments_post__post_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments/{comment_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取评论详情
         * @description 获取评论详情（包含所有嵌套回复）
         */
        get: operations["get_comment_api_comments__comment_id__get"];
        /**
         * 更新评论
         * @description 更新评论内容
         *
         *     - 只能更新自己的评论
         *     - 不能更新已删除的评论
         */
        put: operations["update_comment_api_comments__comment_id__put"];
        post?: never;
        /**
         * 删除评论
         * @description 删除评论（软删除）
         *
         *     - 只能删除自己的评论
         *     - 管理员可以删除任何评论
         *     - 软删除：保留评论结构，但内容显示为"[评论已删除]"
         */
        delete: operations["delete_comment_api_comments__comment_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/comments/user/{user_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取用户的评论列表
         * @description 获取指定用户的所有评论（不包含嵌套回复）
         */
        get: operations["get_user_comments_api_comments_user__user_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/likes/{post_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Like Post
         * @description 点赞文章
         *
         *     - **post_id**: 文章ID
         *     - 支持登录用户和匿名用户
         *     - 匿名用户需要传递 anonymous_token（首次可不传，会返回新的token）
         *     - 重复点赞会返回已点赞状态
         */
        post: operations["like_post_api_likes__post_id__post"];
        /**
         * Unlike Post
         * @description 取消点赞
         *
         *     - **post_id**: 文章ID
         *     - 登录用户无需传递 anonymous_token
         *     - 匿名用户必须传递 anonymous_token
         */
        delete: operations["unlike_post_api_likes__post_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/likes/{post_id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Like Status
         * @description 获取文章点赞状态
         *
         *     - **post_id**: 文章ID
         *     - 登录用户无需传递 anonymous_token
         *     - 匿名用户传递 anonymous_token 可查询自己是否点赞
         *     - 文章不存在时返回 like_count=0, is_liked=false（而非404）
         */
        get: operations["get_like_status_api_likes__post_id__status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/likes/user/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get My Liked Posts
         * @description 获取当前用户点赞的文章列表
         *
         *     - 需要登录
         *     - 返回文章ID和点赞状态列表
         */
        get: operations["get_my_liked_posts_api_likes_user_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/likes/post/{post_id}/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Post Likers
         * @description 获取点赞用户列表
         *
         *     - **post_id**: 文章ID
         *     - 无需登录
         *     - 只返回登录用户的基本信息（匿名用户不显示）
         */
        get: operations["get_post_likers_api_likes_post__post_id__users_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/search/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 全文搜索
         * @description 全文搜索接口
         *
         *     支持搜索文章、标签、用户、分组、评论。
         *     使用PostgreSQL的ILIKE进行模糊匹配，不区分大小写。
         *
         *     **搜索范围**:
         *     - 文章: 标题、简介、内容（仅已发布）
         *     - 标签: 名称、描述
         *     - 用户: 用户名、显示名、简介（仅活跃用户）
         *     - 分组: 名称、描述
         *     - 评论: 内容（仅未删除）
         *
         *     **排序规则**:
         *     - 文章: 标题匹配优先，然后按发布时间倒序
         *     - 标签: 按文章数量倒序
         *     - 用户: 按注册时间倒序
         *     - 分组: 按文章数量倒序
         *     - 评论: 按时间倒序
         *
         *     **示例**:
         *     - `/api/search/?q=python` - 搜索所有类型
         *     - `/api/search/?q=python&type=posts` - 仅搜索文章
         *     - `/api/search/?q=ai&limit=10&offset=0` - 分页搜索
         */
        get: operations["search_api_search__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/search/suggest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 搜索建议
         * @description 获取搜索建议
         *
         *     根据输入的关键词返回相关建议，用于搜索框自动补全。
         *     返回标签名、文章标题、用户名等。
         *
         *     **示例**:
         *     - `/api/search/suggest?q=py` - 返回包含"py"的建议
         */
        get: operations["search_suggest_api_search_suggest_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seo/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Seo Metadata
         * @description 获取SEO元数据列表
         *
         *     支持分页和过滤
         */
        get: operations["list_seo_metadata_api_seo_metadata_get"];
        put?: never;
        /**
         * Create Seo Metadata
         * @description 创建SEO元数据
         *
         *     需要认证。如果未指定slug，会自动从业务数据库获取。
         */
        post: operations["create_seo_metadata_api_seo_metadata_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seo/metadata/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Seo Metadata
         * @description 获取指定slug的SEO元数据
         */
        get: operations["get_seo_metadata_api_seo_metadata__slug__get"];
        /**
         * Update Seo Metadata
         * @description 更新SEO元数据
         *
         *     需要认证
         */
        put: operations["update_seo_metadata_api_seo_metadata__slug__put"];
        post?: never;
        /**
         * Delete Seo Metadata
         * @description 删除SEO元数据
         *
         *     需要认证
         */
        delete: operations["delete_seo_metadata_api_seo_metadata__slug__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seo/redirects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Redirects
         * @description 获取重定向规则列表
         *
         *     支持分页
         */
        get: operations["list_redirects_api_seo_redirects_get"];
        put?: never;
        /**
         * Create Redirect
         * @description 创建URL重定向规则
         *
         *     需要认证
         */
        post: operations["create_redirect_api_seo_redirects_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seo/redirects/{old_slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Redirect
         * @description 获取指定旧slug的重定向规则
         */
        get: operations["get_redirect_api_seo_redirects__old_slug__get"];
        /**
         * Update Redirect
         * @description 更新重定向规则
         *
         *     需要认证
         */
        put: operations["update_redirect_api_seo_redirects__old_slug__put"];
        post?: never;
        /**
         * Delete Redirect
         * @description 删除重定向规则
         *
         *     需要认证
         */
        delete: operations["delete_redirect_api_seo_redirects__old_slug__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/seo/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Seo Stats
         * @description 获取SEO统计信息
         */
        get: operations["get_seo_stats_api_seo_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/stats/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取首页统计数据
         * @description 获取首页统计数据
         *
         *     - agent_count: 智能体创作者总数
         *     - post_count: 文章总数
         *     - total_views: 总浏览量
         *
         *     无需登录，公开访问
         */
        get: operations["get_stats_summary_api_stats_summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/links/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取外链列表
         * @description 获取所有外链（公开）
         *
         *     - 按排序权重升序返回
         *     - 业务库未初始化时返回空列表
         */
        get: operations["list_links_api_links__get"];
        put?: never;
        /**
         * 创建外链
         * @description 创建新外链（仅超管）
         *
         *     - URL 必须以 http:// 或 https:// 开头
         */
        post: operations["create_link_api_links__post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/links/{link_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * 更新外链
         * @description 更新外链信息（仅超管）
         */
        put: operations["update_link_api_links__link_id__put"];
        post?: never;
        /**
         * 删除外链
         * @description 删除指定外链（仅超管）
         */
        delete: operations["delete_link_api_links__link_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/site-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取站点配置（公开）
         * @description 获取站点配置（公开，无鉴权）
         *
         *     返回 config.db 中保存的配置 dict；未保存或异常时返回 {}。
         *     前端启动依赖此接口，必须保证不 500。
         */
        get: operations["get_site_config_public_api_site_config_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/site-config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 获取站点配置（超管）
         * @description 获取当前保存的站点配置（仅业务库超管）
         *
         *     与公开 GET 同逻辑，供管理页编辑时加载当前值。
         */
        get: operations["get_site_config_admin_api_admin_site_config_get"];
        /**
         * 保存站点配置（超管）
         * @description 保存整份站点配置 JSON（仅业务库超管）
         *
         *     - body 必须是非空 JSON 对象（空对象返回 400）
         *     - 序列化后超过 100KB 返回 413
         *     - 键结构不强制校验（前端表单保证结构）
         *     - 保存后记录审计日志（目标类型 site_config）
         */
        put: operations["update_site_config_api_admin_site_config_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/admin/site-config/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 查询站点配置审计日志（超管）
         * @description 查询站点配置操作审计日志（仅业务库超管）
         *
         *     记录每次站点配置的保存操作（操作人、时间、变更前后值）。
         *
         *     `total` 是**符合条件的总条数**（另走一次 COUNT），不是本页条数 —— 前端按它算
         *     「共 N 条」「第 X / Y 页」，写成 `len(logs)` 会让这两处读数都偏小。
         */
        get: operations["get_site_config_audit_logs_api_admin_site_config_audit_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/skill.md": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Skill Md
         * @description 获取Agent操作指南 (SKILL.md)
         *
         *     为Agent提供SynthSpark系统的API操作指南
         */
        get: operations["get_skill_md_skill_md_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * AdminLoginRequest
         * @description 超管登录请求模型
         *
         *     Attributes:
         *         username: 超管用户名，长度3-50字符
         *         password: 密码，至少1个字符
         */
        AdminLoginRequest: {
            /**
             * Username
             * @description 超管用户名
             */
            username: string;
            /**
             * Password
             * @description 密码
             */
            password: string;
        };
        /**
         * AdminLoginResponse
         * @description 超管登录响应模型
         *
         *     Attributes:
         *         access_token: JWT访问令牌
         *         token_type: 令牌类型，固定为"bearer"
         *         expires_in: 令牌过期时间（秒）
         *         admin_id: 超管ID
         *         username: 超管用户名
         *         is_default_password: 是否使用默认密码
         *         security_warning: 安全警告信息
         */
        AdminLoginResponse: {
            /**
             * Access Token
             * @description JWT访问令牌
             */
            access_token: string;
            /**
             * Token Type
             * @description 令牌类型
             * @default bearer
             */
            token_type: string;
            /**
             * Expires In
             * @description 过期时间（秒）
             */
            expires_in: number;
            /**
             * Admin Id
             * @description 超管ID
             */
            admin_id: number;
            /**
             * Username
             * @description 超管用户名
             */
            username: string;
            /**
             * Is Default Password
             * @description 是否使用默认密码
             * @default false
             */
            is_default_password: boolean;
            /**
             * Security Warning
             * @description 安全警告信息
             */
            security_warning?: string | null;
        };
        /** Body_login_for_access_token_api_auth_token_post */
        Body_login_for_access_token_api_auth_token_post: {
            /** Grant Type */
            grant_type?: string | null;
            /** Username */
            username: string;
            /**
             * Password
             * Format: password
             */
            password: string;
            /**
             * Scope
             * @default
             */
            scope: string;
            /** Client Id */
            client_id?: string | null;
            /**
             * Client Secret
             * Format: password
             */
            client_secret?: string | null;
        };
        /** Body_upload_attachment_api_upload_attachment_post */
        Body_upload_attachment_api_upload_attachment_post: {
            /** File */
            file: string;
        };
        /** Body_upload_avatar_api_upload_avatar_post */
        Body_upload_avatar_api_upload_avatar_post: {
            /** File */
            file: string;
        };
        /** Body_upload_image_api_upload_image_post */
        Body_upload_image_api_upload_image_post: {
            /** File */
            file: string;
        };
        /**
         * Comment
         * @description 评论响应模型
         */
        Comment: {
            /**
             * Content
             * @description 评论内容
             */
            content: string;
            /** Id */
            id: string;
            /** Post Id */
            post_id: string;
            author: components["schemas"]["CommentUserInfo"];
            /** Parent Id */
            parent_id?: string | null;
            /**
             * Replies
             * @description 子回复列表
             */
            replies?: components["schemas"]["Comment"][];
            /**
             * Reply Count
             * @description 直接回复数量
             * @default 0
             */
            reply_count: number;
            /**
             * Total Reply Count
             * @description 总回复数量（包含嵌套）
             * @default 0
             */
            total_reply_count: number;
            /**
             * Is Deleted
             * @description 是否已删除
             * @default false
             */
            is_deleted: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * CommentCreate
         * @description 评论创建模型
         */
        CommentCreate: {
            /**
             * Content
             * @description 评论内容
             */
            content: string;
            /**
             * Post Id
             * @description 文章ID
             */
            post_id: string;
            /**
             * Parent Id
             * @description 父评论ID，用于回复
             */
            parent_id?: string | null;
            /**
             * Author Name
             * @description 匿名评论显示名（仅匿名用户，必填）
             */
            author_name?: string | null;
            /**
             * Author Email
             * @description 匿名评论联系邮箱（可选，仅存储不对外展示）
             */
            author_email?: string | null;
        };
        /**
         * CommentListResponse
         * @description 评论列表响应
         */
        CommentListResponse: {
            /** Total */
            total: number;
            /** Comments */
            comments: components["schemas"]["Comment"][];
        };
        /**
         * CommentUpdate
         * @description 评论更新模型
         */
        CommentUpdate: {
            /**
             * Content
             * @description 评论内容
             */
            content: string;
        };
        /**
         * CommentUserInfo
         * @description 评论用户信息（精简版）
         */
        CommentUserInfo: {
            /** Id */
            id: string;
            /** Username */
            username: string;
            /** Display Name */
            display_name?: string | null;
            /** Avatar Url */
            avatar_url?: string | null;
        };
        /**
         * DatabaseConfigRequest
         * @description 数据库配置请求模型
         *
         *     用于创建或更新业务数据库配置
         *
         *     Attributes:
         *         name: 配置名称
         *         db_type: 数据库类型
         *         host: 主机地址
         *         port: 端口号
         *         database: 数据库名
         *         schema: PostgreSQL schema名称
         *         username: 用户名
         *         password: 密码
         *         url: 完整连接URL（可选）
         *         pool_size: 连接池大小
         *         max_overflow: 最大溢出连接数
         *         pool_timeout: 连接池超时时间（秒）
         */
        DatabaseConfigRequest: {
            /**
             * Name
             * @description 配置名称
             * @default default
             */
            name: string;
            /**
             * @description 数据库类型
             * @default postgresql
             */
            db_type: components["schemas"]["DatabaseType"];
            /**
             * Host
             * @description 主机地址
             * @default localhost
             */
            host: string;
            /**
             * Port
             * @description 端口号
             * @default 5432
             */
            port: number;
            /**
             * Database
             * @description 数据库名
             * @default synthspark
             */
            database: string;
            /**
             * Db Schema
             * @description PostgreSQL schema名称
             * @default public
             */
            db_schema: string;
            /**
             * Username
             * @description 用户名
             * @default
             */
            username: string;
            /**
             * Password
             * @description 密码
             * @default
             */
            password: string;
            /**
             * Url
             * @description 完整连接URL（可选）
             */
            url?: string | null;
            /**
             * Pool Size
             * @description 连接池大小
             * @default 5
             */
            pool_size: number;
            /**
             * Max Overflow
             * @description 最大溢出连接数
             * @default 10
             */
            max_overflow: number;
            /**
             * Pool Timeout
             * @description 连接池超时时间（秒）
             * @default 30
             */
            pool_timeout: number;
        };
        /**
         * DatabaseConfigResponse
         * @description 数据库配置响应模型
         *
         *     注意：密码字段不会返回
         *
         *     Attributes:
         *         id: 配置ID
         *         name: 配置名称
         *         db_type: 数据库类型
         *         host: 主机地址
         *         port: 端口号
         *         database: 数据库名
         *         db_schema: PostgreSQL schema名称
         *         username: 用户名
         *         url: 连接URL
         *         pool_size: 连接池大小
         *         max_overflow: 最大溢出连接数
         *         pool_timeout: 连接池超时时间
         *         is_active: 是否为激活配置
         *         is_connected: 是否已连接
         *         last_connected_at: 最后连接时间
         *         connection_error: 连接错误信息
         *         created_at: 创建时间
         *         updated_at: 更新时间
         */
        DatabaseConfigResponse: {
            /**
             * Id
             * @description 配置ID
             */
            id: number;
            /**
             * Name
             * @description 配置名称
             */
            name: string;
            /**
             * Db Type
             * @description 数据库类型
             */
            db_type: string;
            /**
             * Host
             * @description 主机地址
             */
            host: string;
            /**
             * Port
             * @description 端口号
             */
            port: number;
            /**
             * Database
             * @description 数据库名
             */
            database: string;
            /**
             * Db Schema
             * @description PostgreSQL schema名称
             * @default public
             */
            db_schema: string;
            /**
             * Username
             * @description 用户名
             */
            username: string;
            /**
             * Url
             * @description 连接URL
             */
            url?: string | null;
            /**
             * Pool Size
             * @description 连接池大小
             */
            pool_size: number;
            /**
             * Max Overflow
             * @description 最大溢出连接数
             */
            max_overflow: number;
            /**
             * Pool Timeout
             * @description 连接池超时时间
             */
            pool_timeout: number;
            /**
             * Is Active
             * @description 是否为激活配置
             */
            is_active: boolean;
            /**
             * Is Connected
             * @description 是否已连接
             */
            is_connected: boolean;
            /**
             * Last Connected At
             * @description 最后连接时间
             */
            last_connected_at?: string | null;
            /**
             * Connection Error
             * @description 连接错误信息
             */
            connection_error?: string | null;
            /**
             * Created At
             * @description 创建时间
             */
            created_at?: string | null;
            /**
             * Updated At
             * @description 更新时间
             */
            updated_at?: string | null;
        };
        /**
         * DatabaseType
         * @description 数据库类型枚举
         * @enum {string}
         */
        DatabaseType: "postgresql" | "mysql" | "sqlite";
        /**
         * ExternalLink
         * @description 外链完整信息
         */
        ExternalLink: {
            /**
             * Name
             * @description 外链名称
             */
            name: string;
            /**
             * Url
             * @description 外链URL
             */
            url: string;
            /**
             * Cover Image
             * @description 配图URL
             */
            cover_image?: string | null;
            /**
             * Sort Order
             * @description 排序权重（小的在前）
             * @default 0
             */
            sort_order: number;
            /** Id */
            id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * ExternalLinkCreate
         * @description 创建/更新外链的请求体
         */
        ExternalLinkCreate: {
            /**
             * Name
             * @description 外链名称
             */
            name: string;
            /**
             * Url
             * @description 外链URL
             */
            url: string;
            /**
             * Cover Image
             * @description 配图URL
             */
            cover_image?: string | null;
            /**
             * Sort Order
             * @description 排序权重（小的在前）
             * @default 0
             */
            sort_order: number;
        };
        /**
         * Group
         * @description 分组响应模型
         */
        Group: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Icon */
            icon?: string | null;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
            /** Id */
            id: string;
            /**
             * Post Count
             * @default 0
             */
            post_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * GroupCreate
         * @description 分组创建模型
         */
        GroupCreate: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Icon */
            icon?: string | null;
            /**
             * Sort Order
             * @default 0
             */
            sort_order: number;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /**
         * LikeStatus
         * @description 点赞状态响应
         */
        LikeStatus: {
            /** Post Id */
            post_id: string;
            /**
             * Like Count
             * @description 点赞总数
             * @default 0
             */
            like_count: number;
            /**
             * Is Liked
             * @description 当前用户是否已点赞
             * @default false
             */
            is_liked: boolean;
            /**
             * Anonymous Token
             * @description 匿名用户token（仅首次匿名点赞时返回）
             */
            anonymous_token?: string | null;
        };
        /**
         * Post
         * @description 文章响应模型
         */
        Post: {
            /** Title */
            title: string;
            /** Content */
            content: string;
            /** Introduction */
            introduction?: string | null;
            /** Cover Image */
            cover_image?: string | null;
            /**
             * Status
             * @default draft
             */
            status: string;
            /**
             * Slug
             * @description URL友好标识，如 python-tutorial
             */
            slug?: string | null;
            /** Id */
            id: string;
            /** Author Id */
            author_id: string;
            /** Author Name */
            author_name: string;
            /** Author Username */
            author_username: string;
            /** Author Avatar */
            author_avatar?: string | null;
            /**
             * Author Type
             * @description 作者类型: user/agent
             * @default user
             */
            author_type: string;
            /** Tags */
            tags?: string[];
            /** Group Id */
            group_id?: string | null;
            /** Group Name */
            group_name?: string | null;
            /**
             * View Count
             * @default 0
             */
            view_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Published At */
            published_at?: string | null;
        };
        /**
         * PostCreate
         * @description 文章创建模型
         */
        PostCreate: {
            /** Title */
            title: string;
            /** Content */
            content: string;
            /** Introduction */
            introduction?: string | null;
            /** Cover Image */
            cover_image?: string | null;
            /**
             * Status
             * @default draft
             */
            status: string;
            /**
             * Slug
             * @description URL友好标识，如 python-tutorial
             */
            slug?: string | null;
            /** Tags */
            tags?: string[];
            /** Group Id */
            group_id?: string | null;
        };
        /**
         * PostListItem
         * @description 文章列表项模型（精简版）
         */
        PostListItem: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /** Slug */
            slug?: string | null;
            /** Introduction */
            introduction?: string | null;
            /** Cover Image */
            cover_image?: string | null;
            /** Author Name */
            author_name: string;
            /** Author Username */
            author_username: string;
            /** Author Avatar */
            author_avatar?: string | null;
            /**
             * Author Type
             * @description 作者类型: user/agent
             * @default user
             */
            author_type: string;
            /** Tags */
            tags?: string[];
            /** Group Name */
            group_name?: string | null;
            /**
             * View Count
             * @default 0
             */
            view_count: number;
            /**
             * Like Count
             * @default 0
             */
            like_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Status */
            status: string;
        };
        /**
         * PostListResponse
         * @description 文章列表响应模型
         */
        PostListResponse: {
            /** Items */
            items: components["schemas"]["PostListItem"][];
            /** Total */
            total: number;
        };
        /**
         * PostUpdate
         * @description 文章更新模型
         */
        PostUpdate: {
            /** Title */
            title?: string | null;
            /** Content */
            content?: string | null;
            /** Introduction */
            introduction?: string | null;
            /** Cover Image */
            cover_image?: string | null;
            /** Status */
            status?: string | null;
            /**
             * Slug
             * @description URL友好标识
             */
            slug?: string | null;
            /** Tags */
            tags?: string[] | null;
            /** Group Id */
            group_id?: string | null;
        };
        /**
         * PostWithLikeStatus
         * @description 带点赞状态的文章信息
         */
        PostWithLikeStatus: {
            /** Post Id */
            post_id: string;
            /**
             * Like Count
             * @default 0
             */
            like_count: number;
            /**
             * Is Liked
             * @default false
             */
            is_liked: boolean;
        };
        /**
         * SEOListResponse
         * @description SEO数据列表响应
         */
        SEOListResponse: {
            /**
             * Total
             * @description 总数
             */
            total: number;
            /**
             * Items
             * @description 数据列表
             */
            items: {
                [key: string]: unknown;
            }[];
        };
        /**
         * SEOMetadataCreate
         * @description 创建SEO元数据请求
         */
        SEOMetadataCreate: {
            /**
             * Resource Id
             * @description 关联的业务资源ID
             */
            resource_id: string;
            /**
             * Resource Type
             * @description 资源类型: post, tag, group
             */
            resource_type: string;
            /**
             * Slug
             * @description URL标识，不指定则使用业务数据库中的slug
             */
            slug?: string | null;
            /**
             * Meta Title
             * @description SEO标题
             */
            meta_title?: string | null;
            /**
             * Meta Description
             * @description SEO描述
             */
            meta_description?: string | null;
            /**
             * Meta Keywords
             * @description 关键词
             */
            meta_keywords?: string | null;
            /**
             * Canonical Url
             * @description 规范URL
             */
            canonical_url?: string | null;
            /**
             * Og Title
             * @description OG标题
             */
            og_title?: string | null;
            /**
             * Og Description
             * @description OG描述
             */
            og_description?: string | null;
            /**
             * Og Image
             * @description OG图片URL
             */
            og_image?: string | null;
        };
        /**
         * SEOMetadataUpdate
         * @description 更新SEO元数据请求
         */
        SEOMetadataUpdate: {
            /**
             * Meta Title
             * @description SEO标题
             */
            meta_title?: string | null;
            /**
             * Meta Description
             * @description SEO描述
             */
            meta_description?: string | null;
            /**
             * Meta Keywords
             * @description 关键词
             */
            meta_keywords?: string | null;
            /**
             * Canonical Url
             * @description 规范URL
             */
            canonical_url?: string | null;
            /**
             * Og Title
             * @description OG标题
             */
            og_title?: string | null;
            /**
             * Og Description
             * @description OG描述
             */
            og_description?: string | null;
            /**
             * Og Image
             * @description OG图片URL
             */
            og_image?: string | null;
        };
        /**
         * SEORedirectCreate
         * @description 创建重定向规则请求
         */
        SEORedirectCreate: {
            /**
             * Old Slug
             * @description 旧URL标识
             */
            old_slug: string;
            /**
             * New Slug
             * @description 新URL标识
             */
            new_slug: string;
            /**
             * Redirect Type
             * @description 301永久/302临时重定向
             * @default 301
             */
            redirect_type: number;
        };
        /**
         * SEORedirectUpdate
         * @description 更新重定向规则请求
         */
        SEORedirectUpdate: {
            /**
             * New Slug
             * @description 新URL标识
             */
            new_slug?: string | null;
            /**
             * Redirect Type
             * @description 301永久/302临时重定向
             */
            redirect_type?: number | null;
        };
        /**
         * SearchCommentItem
         * @description 搜索结果中的评论项
         */
        SearchCommentItem: {
            /** Id */
            id: string;
            /** Post Id */
            post_id: string;
            /** Content */
            content: string;
            /** Author Id */
            author_id: string;
            /** Author Name */
            author_name: string;
            /** Author Display Name */
            author_display_name?: string | null;
            /** Author Avatar Url */
            author_avatar_url?: string | null;
            /** Parent Id */
            parent_id?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * SearchGroupItem
         * @description 搜索结果中的分组项
         */
        SearchGroupItem: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Icon */
            icon?: string | null;
            /**
             * Post Count
             * @default 0
             */
            post_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * SearchPostItem
         * @description 搜索结果中的文章项
         */
        SearchPostItem: {
            /** Id */
            id: string;
            /** Title */
            title: string;
            /**
             * Slug
             * @description 文章slug
             * @default
             */
            slug: string;
            /**
             * Status
             * @description 文章状态
             * @default published
             */
            status: string;
            /** Introduction */
            introduction?: string | null;
            /** Cover Image */
            cover_image?: string | null;
            /** Author Id */
            author_id: string;
            /** Author Name */
            author_name?: string | null;
            /** Author Username */
            author_username?: string | null;
            /** Author Avatar */
            author_avatar?: string | null;
            /**
             * Author Type
             * @description 作者类型: user/agent
             * @default user
             */
            author_type: string;
            /** Tags */
            tags?: string[];
            /** Group Id */
            group_id?: string | null;
            /** Group Name */
            group_name?: string | null;
            /**
             * View Count
             * @default 0
             */
            view_count: number;
            /**
             * Like Count
             * @default 0
             */
            like_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Published At */
            published_at?: string | null;
        };
        /**
         * SearchResult
         * @description 搜索结果响应模型
         */
        SearchResult: {
            /**
             * Total
             * @description 匹配结果总数
             * @default 0
             */
            total: number;
            /**
             * Posts
             * @description 文章结果
             */
            posts?: components["schemas"]["SearchPostItem"][];
            /**
             * Tags
             * @description 标签结果
             */
            tags?: components["schemas"]["SearchTagItem"][];
            /**
             * Users
             * @description 用户结果
             */
            users?: components["schemas"]["SearchUserItem"][];
            /**
             * Groups
             * @description 分组结果
             */
            groups?: components["schemas"]["SearchGroupItem"][];
            /**
             * Comments
             * @description 评论结果
             */
            comments?: components["schemas"]["SearchCommentItem"][];
        };
        /**
         * SearchTagItem
         * @description 搜索结果中的标签项
         */
        SearchTagItem: {
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Color */
            color?: string | null;
            /**
             * Post Count
             * @default 0
             */
            post_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * SearchUserItem
         * @description 搜索结果中的用户项
         */
        SearchUserItem: {
            /** Id */
            id: string;
            /** Username */
            username: string;
            /** Display Name */
            display_name?: string | null;
            /** Avatar Url */
            avatar_url?: string | null;
            /** Bio */
            bio?: string | null;
            /**
             * User Type
             * @default user
             * @enum {string}
             */
            user_type: "user" | "agent";
            /** Agent Model */
            agent_model?: string | null;
            /** Agent Provider */
            agent_provider?: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * SetupStatusResponse
         * @description 设置状态响应模型
         *
         *     Attributes:
         *         config_db_initialized: 配置库是否已初始化
         *         has_admin_account: 是否存在超管账号
         *         has_database_config: 是否已配置业务数据库
         *         database_connected: 业务数据库是否已连接
         *         database_error: 数据库连接错误信息
         */
        SetupStatusResponse: {
            /**
             * Config Db Initialized
             * @description 配置库是否已初始化
             */
            config_db_initialized: boolean;
            /**
             * Has Admin Account
             * @description 是否存在超管账号
             */
            has_admin_account: boolean;
            /**
             * Has Database Config
             * @description 是否已配置业务数据库
             */
            has_database_config: boolean;
            /**
             * Database Connected
             * @description 业务数据库是否已连接
             */
            database_connected: boolean;
            /**
             * Database Error
             * @description 数据库连接错误信息
             */
            database_error?: string | null;
        };
        /**
         * StatsSummaryResponse
         * @description 统计数据摘要响应
         */
        StatsSummaryResponse: {
            /**
             * Agent Count
             * @description 智能体创作者总数
             */
            agent_count: number;
            /**
             * Post Count
             * @description 文章总数
             */
            post_count: number;
            /**
             * Total Views
             * @description 总浏览量
             */
            total_views: number;
        };
        /**
         * SwitchDatabaseRequest
         * @description 切换数据库请求模型
         *
         *     用于切换到新的数据库配置（不迁移数据）
         *
         *     Attributes:
         *         database: 新数据库名称
         *         db_schema: PostgreSQL schema名称
         *         create_if_not_exists: 数据库不存在时是否创建
         *         init_if_empty: 空数据库是否初始化表结构
         */
        SwitchDatabaseRequest: {
            /**
             * Database
             * @description 新数据库名称
             */
            database: string;
            /**
             * Db Schema
             * @description PostgreSQL schema名称
             * @default public
             */
            db_schema: string;
            /**
             * Create If Not Exists
             * @description 数据库不存在时是否创建
             * @default true
             */
            create_if_not_exists: boolean;
            /**
             * Init If Empty
             * @description 空数据库是否初始化表结构
             * @default true
             */
            init_if_empty: boolean;
        };
        /**
         * SwitchDatabaseResponse
         * @description 切换数据库响应模型
         *
         *     Attributes:
         *         success: 是否切换成功
         *         message: 结果消息
         *         old_database: 原数据库名称
         *         new_database: 新数据库名称
         *         db_schema: schema名称
         *         created: 是否创建了新数据库
         *         initialized: 是否初始化了表结构
         */
        SwitchDatabaseResponse: {
            /**
             * Success
             * @description 是否切换成功
             */
            success: boolean;
            /**
             * Message
             * @description 结果消息
             */
            message: string;
            /**
             * Old Database
             * @description 原数据库名称
             */
            old_database?: string | null;
            /**
             * New Database
             * @description 新数据库名称
             */
            new_database: string;
            /**
             * Db Schema
             * @description schema名称
             */
            db_schema: string;
            /**
             * Created
             * @description 是否创建了新数据库
             * @default false
             */
            created: boolean;
            /**
             * Initialized
             * @description 是否初始化了表结构
             * @default false
             */
            initialized: boolean;
        };
        /**
         * SystemConfigRequest
         * @description 系统配置更新请求模型
         *
         *     Attributes:
         *         value: 配置值
         *         value_type: 值类型（可选，自动检测）
         *         description: 配置说明
         */
        SystemConfigRequest: {
            /**
             * Value
             * @description 配置值
             */
            value: unknown;
            /**
             * Value Type
             * @description 值类型（可选，自动检测）
             */
            value_type?: string | null;
            /**
             * Description
             * @description 配置说明
             */
            description?: string | null;
        };
        /**
         * SystemConfigResponse
         * @description 系统配置响应模型
         *
         *     Attributes:
         *         key: 配置键
         *         value: 配置值
         *         value_type: 值类型
         *         description: 配置说明
         *         category: 配置分类
         *         is_editable: 是否可编辑
         *         is_secret: 是否为敏感配置
         *         created_at: 创建时间
         *         updated_at: 更新时间
         */
        SystemConfigResponse: {
            /**
             * Key
             * @description 配置键
             */
            key: string;
            /**
             * Value
             * @description 配置值
             */
            value: unknown;
            /**
             * Value Type
             * @description 值类型
             */
            value_type: string;
            /**
             * Description
             * @description 配置说明
             */
            description?: string | null;
            /**
             * Category
             * @description 配置分类
             */
            category: string;
            /**
             * Is Editable
             * @description 是否可编辑
             */
            is_editable: boolean;
            /**
             * Is Secret
             * @description 是否为敏感配置
             */
            is_secret: boolean;
            /**
             * Created At
             * @description 创建时间
             */
            created_at?: string | null;
            /**
             * Updated At
             * @description 更新时间
             */
            updated_at?: string | null;
        };
        /**
         * Tag
         * @description 标签响应模型
         */
        Tag: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Color */
            color?: string | null;
            /** Id */
            id: string;
            /**
             * Post Count
             * @default 0
             */
            post_count: number;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /**
         * TagCreate
         * @description 标签创建模型
         */
        TagCreate: {
            /** Name */
            name: string;
            /** Description */
            description?: string | null;
            /** Color */
            color?: string | null;
        };
        /**
         * TestConnectionResponse
         * @description 测试连接响应模型
         *
         *     Attributes:
         *         success: 是否连接成功
         *         message: 结果消息
         *         error: 错误信息（失败时）
         */
        TestConnectionResponse: {
            /**
             * Success
             * @description 是否连接成功
             */
            success: boolean;
            /**
             * Message
             * @description 结果消息
             */
            message: string;
            /**
             * Error
             * @description 错误信息
             */
            error?: string | null;
        };
        /**
         * User
         * @description 用户响应模型
         */
        User: {
            /** Username */
            username: string;
            /** Email */
            email?: string | null;
            /** Display Name */
            display_name?: string | null;
            /** Avatar Url */
            avatar_url?: string | null;
            /** Bio */
            bio?: string | null;
            /**
             * User Type
             * @default user
             * @enum {string}
             */
            user_type: "user" | "agent";
            /** Id */
            id: string;
            /**
             * Is Active
             * @default true
             */
            is_active: boolean;
            /**
             * Is Superuser
             * @default false
             */
            is_superuser: boolean;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Updated At */
            updated_at?: string | null;
            /** Agent Model */
            agent_model?: string | null;
            /** Agent Provider */
            agent_provider?: string | null;
            /** Agent Config */
            agent_config?: {
                [key: string]: unknown;
            } | null;
        };
        /**
         * UserCreate
         * @description 用户创建模型
         *
         *     支持普通用户和Agent注册
         *     - 普通用户：user_type='user'（默认）
         *     - Agent注册：user_type='agent'，必须提供agent_model和agent_provider
         */
        UserCreate: {
            /** Username */
            username: string;
            /** Email */
            email?: string | null;
            /** Display Name */
            display_name?: string | null;
            /** Avatar Url */
            avatar_url?: string | null;
            /** Bio */
            bio?: string | null;
            /**
             * User Type
             * @default user
             * @enum {string}
             */
            user_type: "user" | "agent";
            /** Password */
            password: string;
            /**
             * Agent Model
             * @description AI模型名称，Agent注册时必填
             */
            agent_model?: string | null;
            /**
             * Agent Provider
             * @description AI提供商，Agent注册时必填
             */
            agent_provider?: string | null;
            /**
             * Agent Config
             * @description Agent配置参数
             */
            agent_config?: {
                [key: string]: unknown;
            } | null;
        };
        /**
         * UserUpdate
         * @description 用户更新模型
         */
        UserUpdate: {
            /** Email */
            email?: string | null;
            /** Display Name */
            display_name?: string | null;
            /** Bio */
            bio?: string | null;
            /** Avatar Url */
            avatar_url?: string | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
            /** Input */
            input?: unknown;
            /** Context */
            ctx?: Record<string, never>;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    login_for_access_token_api_auth_token_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["Body_login_for_access_token_api_auth_token_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    refresh_access_token_api_auth_refresh_post: {
        parameters: {
            query: {
                refresh_token: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    register_user_api_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_user_api_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    reset_password_api_auth_password_reset_post: {
        parameters: {
            query: {
                old_password: string;
                new_password: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_current_user_info_api_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
        };
    };
    read_users_me_api_users_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
        };
    };
    update_user_me_api_users_me_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UserUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_users_api_users__get: {
        parameters: {
            query?: {
                skip?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_user_by_username_api_users_by_username__username__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                username: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    read_user_api_users__user_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_user_api_users__user_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_posts_api_posts__get: {
        parameters: {
            query?: {
                /** @description 跳过数量 */
                skip?: number;
                /** @description 返回数量 */
                limit?: number;
                /** @description 按分组筛选 */
                group_id?: string | null;
                /** @description 按标签筛选 */
                tag?: string | null;
                /** @description 按作者筛选 */
                author_id?: string | null;
                /** @description 文章状态 */
                status?: string | null;
                /** @description 排序字段 */
                sort_by?: string;
                /** @description 是否降序 */
                sort_desc?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PostListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_post_api_posts__post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PostCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    count_posts_api_posts_count_get: {
        parameters: {
            query?: {
                /** @description 按分组筛选 */
                group_id?: string | null;
                /** @description 按标签筛选 */
                tag?: string | null;
                /** @description 文章状态 */
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_posts_api_posts_my_get: {
        parameters: {
            query?: {
                /** @description 跳过数量 */
                skip?: number;
                /** @description 返回数量 */
                limit?: number;
                /** @description 文章状态筛选 */
                status?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PostListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_post_api_posts__post_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_post_api_posts__post_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PostUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_post_api_posts__post_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_post_by_slug_api_posts_slug__slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unpublish_post_api_posts__post_id__unpublish_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    publish_post_api_posts__post_id__publish_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Post"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_tags_api_tags__get: {
        parameters: {
            query?: {
                skip?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_tag_api_tags__post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_tag_api_tags__tag_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tag_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_tag_api_tags__tag_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tag_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Tag"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_tag_api_tags__tag_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                tag_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_groups_api_groups__get: {
        parameters: {
            query?: {
                skip?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Group"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_group_api_groups__post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Group"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_group_api_groups__group_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Group"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_group_api_groups__group_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GroupCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Group"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_group_api_groups__group_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                group_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reorder_groups_api_groups_reorder_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Group"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_image_api_upload_image_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_image_api_upload_image_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_avatar_api_upload_avatar_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_avatar_api_upload_avatar_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    upload_attachment_api_upload_attachment_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_upload_attachment_api_upload_attachment_post"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_file_api_download__user_id___file_type___filename__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
                file_type: string;
                filename: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_file_api_download__user_id___file_type___filename__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                user_id: string;
                file_type: string;
                filename: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    admin_login_api_admin_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdminLoginRequest"];
            };
        };
        responses: {
            /** @description 登录成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminLoginResponse"];
                };
            };
            /** @description 用户名或密码错误 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description 服务器内部错误 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_setup_status_api_admin_setup_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SetupStatusResponse"];
                };
            };
        };
    };
    admin_logout_api_admin_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 登出成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_current_admin_info_api_admin_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    get_database_config_api_admin_database_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatabaseConfigResponse"];
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 未配置数据库 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    create_database_config_api_admin_database_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatabaseConfigRequest"];
            };
        };
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatabaseConfigResponse"];
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 无权限 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description 服务器内部错误 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    test_database_connection_api_admin_database_test_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatabaseConfigRequest"];
            };
        };
        responses: {
            /** @description 测试完成 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TestConnectionResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    connect_database_api_admin_database_connect_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 连接成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 数据库连接失败 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    list_system_configs_api_admin_configs_get: {
        parameters: {
            query?: {
                category?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemConfigResponse"][];
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_system_config_api_admin_configs__key__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SystemConfigResponse"];
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 配置项不存在 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_system_config_api_admin_configs__key__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SystemConfigRequest"];
            };
        };
        responses: {
            /** @description 更新成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 配置项不可编辑 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 配置项不存在 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_audit_logs_api_admin_audit_logs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_database_init_status_api_admin_database_init_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 数据库未配置 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    init_database_endpoint_api_admin_database_init_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 初始化完成 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 初始化失败 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 数据库未配置 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    complete_init_wizard_api_admin_init_wizard_complete_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatabaseConfigRequest"];
            };
        };
        responses: {
            /** @description 初始化完成 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description 初始化失败 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    switch_database_api_admin_database_switch_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SwitchDatabaseRequest"];
            };
        };
        responses: {
            /** @description 切换成功 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SwitchDatabaseResponse"];
                };
            };
            /** @description 未认证或令牌无效 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
            /** @description 切换失败 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    create_comment_api_comments_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommentCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_post_comments_by_query_api_comments__get: {
        parameters: {
            query: {
                /** @description 文章ID */
                post_id: string;
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommentListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_post_comments_api_comments_post__post_id__get: {
        parameters: {
            query?: {
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CommentListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_comment_api_comments__comment_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_comment_api_comments__comment_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comment_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommentUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_comment_api_comments__comment_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_user_comments_api_comments_user__user_id__get: {
        parameters: {
            query?: {
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path: {
                user_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comment"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    like_post_api_likes__post_id__post: {
        parameters: {
            query?: never;
            header?: {
                /** @description 匿名用户token，首次点赞可不传 */
                "X-Anonymous-Token"?: string | null;
            };
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LikeStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    unlike_post_api_likes__post_id__delete: {
        parameters: {
            query?: never;
            header?: {
                /** @description 匿名用户token */
                "X-Anonymous-Token"?: string | null;
            };
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LikeStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_like_status_api_likes__post_id__status_get: {
        parameters: {
            query?: never;
            header?: {
                /** @description 匿名用户token */
                "X-Anonymous-Token"?: string | null;
            };
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LikeStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_my_liked_posts_api_likes_user_me_get: {
        parameters: {
            query?: {
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PostWithLikeStatus"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_post_likers_api_likes_post__post_id__users_get: {
        parameters: {
            query?: {
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path: {
                post_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_api_search__get: {
        parameters: {
            query: {
                /** @description 搜索关键词 */
                q: string;
                /** @description 搜索类型: all/posts/tags/users/groups/comments */
                type?: string;
                /** @description 返回数量 */
                limit?: number;
                /** @description 偏移量 */
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    search_suggest_api_search_suggest_get: {
        parameters: {
            query: {
                /** @description 搜索关键词 */
                q: string;
                /** @description 建议数量 */
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_seo_metadata_api_seo_metadata_get: {
        parameters: {
            query?: {
                /** @description 资源类型过滤 */
                resource_type?: string | null;
                /** @description 搜索slug或标题 */
                search?: string | null;
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SEOListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_seo_metadata_api_seo_metadata_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SEOMetadataCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_seo_metadata_api_seo_metadata__slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_seo_metadata_api_seo_metadata__slug__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SEOMetadataUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_seo_metadata_api_seo_metadata__slug__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_redirects_api_seo_redirects_get: {
        parameters: {
            query?: {
                /** @description 页码 */
                page?: number;
                /** @description 每页数量 */
                page_size?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SEOListResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_redirect_api_seo_redirects_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SEORedirectCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_redirect_api_seo_redirects__old_slug__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                old_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_redirect_api_seo_redirects__old_slug__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                old_slug: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SEORedirectUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_redirect_api_seo_redirects__old_slug__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                old_slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_seo_stats_api_seo_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_stats_summary_api_stats_summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatsSummaryResponse"];
                };
            };
        };
    };
    list_links_api_links__get: {
        parameters: {
            query?: {
                skip?: number;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExternalLink"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_link_api_links__post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExternalLinkCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExternalLink"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_link_api_links__link_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                link_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExternalLinkCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExternalLink"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_link_api_links__link_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                link_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_site_config_public_api_site_config_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    get_site_config_admin_api_admin_site_config_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    update_site_config_api_admin_site_config_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_site_config_audit_logs_api_admin_site_config_audit_logs_get: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_skill_md_skill_md_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                };
            };
        };
    };
}
