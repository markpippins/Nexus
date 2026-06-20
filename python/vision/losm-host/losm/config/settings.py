import os
from pathlib import Path


def _env_bool(key: str, default: bool = False) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in {"1", "true", "yes", "on"}


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, default))
    except ValueError:
        return default


DATABASE_URL: str = os.getenv(
    "LOSM_DATABASE_URL",
    "sqlite:///./losm_host.db",
)

ENABLE_CRITIC: bool = _env_bool("LOSMS_ENABLE_CRITIC", False)
ENABLE_TEMPLATES: bool = _env_bool("LOSMS_ENABLE_TEMPLATES", False)
ENABLE_DAG: bool = _env_bool("LOSMS_ENABLE_DAG", False)
ENABLE_MCTS: bool = _env_bool("LOSMS_ENABLE_MCTS", False)

MAX_RETRIES: int = _env_int("LOSMS_MAX_RETRIES", 3)
TIMEOUT_SECONDS: int = _env_int("LOSMS_TIMEOUT_SECONDS", 30)

BASE_DIR = Path(__file__).resolve().parent.parent


def get_path(*subpaths: str) -> Path:
    return BASE_DIR.joinpath(*subpaths)


__all__ = [
    "DATABASE_URL",
    "ENABLE_CRITIC",
    "ENABLE_TEMPLATES",
    "ENABLE_DAG",
    "ENABLE_MCTS",
    "MAX_RETRIES",
    "TIMEOUT_SECONDS",
    "BASE_DIR",
    "get_path",
]
