"""
服务注册表：自动发现并挂载用户自定义服务

挂载框架（本文件）进 git 仓库；具体服务实现放 `impl/` 目录（gitignored）。
服务契约（模块级变量）：
- name: str        唯一ID，仅允许小写字母/数字/短横线，决定挂载URL /api/services/{name}/
- title: str       显示名称
- router: APIRouter 业务接口
- static_dir: str  可选，UI静态目录，解析顺序：模块同名子目录（impl/{模块名}/{static_dir}）→ 模块所在目录（impl/{static_dir}）

挂载顺序（关键）：
1. 先 include_router 挂 API 路由（精确匹配优先）
2. 再 app.mount 挂 StaticFiles（html=True，其余路径兜底，根路径自动返回 index.html）
"""
import importlib.util
import logging
import re
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

# 服务实现目录（gitignored，部署者自行编写服务）
IMPL_DIR = Path(__file__).parent / "impl"

# name 字段的合法格式：小写字母/数字/短横线
_NAME_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def _load_module(module_path: Path) -> Optional[object]:
    """按文件路径加载一个 Python 模块"""
    module_name = f"synthspark_service_{module_path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        logger.warning("[服务挂载] 无法加载模块: %s", module_path)
        return None
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
        return module
    except Exception as e:
        logger.warning("[服务挂载] 模块 %s 导入失败: %s", module_path.name, e)
        return None


def _validate_module(module: object) -> tuple:
    """校验服务契约，返回 (契约dict, 错误信息)"""
    name = getattr(module, "name", None)
    title = getattr(module, "title", None)
    router = getattr(module, "router", None)

    if not name or not title or not router:
        return None, f"缺少契约字段（需要 name/title/router，参考 examples/hello_service.py）"
    if not isinstance(name, str) or not _NAME_PATTERN.fullmatch(name):
        return None, f"name 非法（仅允许小写字母/数字/短横线）: {name}"
    if not isinstance(title, str):
        return None, f"title 必须是字符串: {title}"
    if not isinstance(router, APIRouter):
        return None, f"router 必须是 APIRouter 实例"

    static_dir = getattr(module, "static_dir", None)
    return {
        "name": name,
        "title": title,
        "router": router,
        "static_dir": static_dir,
        "module_path": Path(module.__file__).resolve().parent,
    }, None


def register_services(app: FastAPI) -> List[dict]:
    """
    扫描 impl/ 目录并挂载所有合法服务

    Args:
        app: FastAPI 应用实例（直接挂载到 app 上，前缀 /api/services/{name}）

    Returns:
        已注册服务元数据列表
    """
    registered: List[dict] = []
    seen_names: set = set()

    # 目录不存在（未配置任何服务）时正常返回空列表
    if not IMPL_DIR.exists():
        logger.info("[服务挂载] 未发现 impl/ 目录，跳过服务挂载")
        return registered

    for module_path in sorted(IMPL_DIR.glob("*.py")):
        if module_path.name.startswith("_"):
            continue

        module = _load_module(module_path)
        if module is None:
            continue

        contract, error = _validate_module(module)
        if error:
            logger.warning("[服务挂载] 跳过 %s: %s", module_path.name, error)
            continue

        name = contract["name"]
        if name in seen_names:
            logger.warning("[服务挂载] 跳过 %s: name 与已有服务重复 (%s)", module_path.name, name)
            continue
        seen_names.add(name)

        prefix = f"/api/services/{name}"
        base_dir = contract["module_path"]
        static_dir = contract["static_dir"]

        # 1. 先挂 API 路由（精确匹配优先于静态挂载）
        app.include_router(contract["router"], prefix=prefix, tags=[f"服务-{contract['title']}"])
        logger.info("[服务挂载] 已挂载服务 API: %s -> %s", name, prefix)

        # 2. 再挂静态 UI 目录（可选，根路径自动返回 index.html）
        if static_dir:
            # 优先解析为模块同名子目录（impl/{stem}/{static_dir}），
            # 其次才是模块所在目录（impl/{static_dir}），避免多服务共享目录冲突
            candidates = [
                base_dir / module_path.stem / static_dir,
                base_dir / static_dir,
            ]
            static_path = next((p for p in candidates if p.is_dir()), None)
            if static_path:
                app.mount(f"{prefix}/", StaticFiles(directory=static_path, html=True))
                logger.info("[服务挂载] 已挂载服务 UI: %s -> %s", name, static_path)
            else:
                logger.warning(
                    "[服务挂载] 服务 %s 的 static_dir 未找到（查找: %s），跳过 UI 挂载",
                    name,
                    "、".join(str(p) for p in candidates),
                )

        registered.append({"name": name, "title": contract["title"], "url": f"{prefix}/"})

    return registered
