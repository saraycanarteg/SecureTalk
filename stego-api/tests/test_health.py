import pytest
from pydantic import ValidationError

from app.config import Settings


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready(client):
    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"


def test_short_token_rejected(monkeypatch):
    monkeypatch.setenv("STEGO_INTERNAL_TOKEN", "corto")
    with pytest.raises(ValidationError):
        Settings()


def test_token_from_file(monkeypatch, tmp_path):
    secret = tmp_path / "token"
    secret.write_text("s" * 40 + "\n", encoding="utf-8")
    monkeypatch.setenv("STEGO_INTERNAL_TOKEN_FILE", str(secret))
    assert Settings().internal_token == "s" * 40
