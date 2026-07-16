import tomllib
from pathlib import Path


BACKEND_ROOT = Path(__file__).parents[1]


def _release_tuple(version: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in version.split(".")[:3])


def test_proxy_dependency_policy_uses_fixed_compatible_versions():
    pyproject = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())
    dependencies = pyproject["project"]["dependencies"]
    proxy_dependencies = pyproject["project"]["optional-dependencies"]["litellm"]

    assert "openai>=2.20.0,<3" in dependencies
    assert "cryptography>=48.0.1,<49" in dependencies
    assert "litellm[proxy]==1.91.3" in proxy_dependencies


def test_locked_proxy_dependencies_exclude_blocking_advisories():
    lock = tomllib.loads((BACKEND_ROOT / "uv.lock").read_text())
    versions = {package["name"]: package["version"] for package in lock["package"]}
    litellm = next(
        package for package in lock["package"] if package["name"] == "litellm"
    )

    assert versions["litellm"] == "1.91.3"
    assert any(
        wheel["url"].endswith("-py3-none-any.whl")
        for wheel in litellm["wheels"]
    )
    assert _release_tuple(versions["openai"]) >= (2, 20, 0)
    assert _release_tuple(versions["cryptography"]) >= (48, 0, 1)
    assert _release_tuple(versions["mcp"]) >= (1, 26, 0)
