import os

import pytest

TEST_TOKEN = "test-token-" + "x" * 40
os.environ.setdefault("STEGO_INTERNAL_TOKEN", TEST_TOKEN)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict:
    return {"X-Internal-Token": TEST_TOKEN}
