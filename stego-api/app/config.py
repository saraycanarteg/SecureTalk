"""Configuración del servicio leída de variables de entorno (prefijo STEGO_)."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_TOKEN_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STEGO_", extra="ignore")

    # El token puede venir directo o desde un archivo (Docker secret), nunca del código.
    internal_token: str = ""
    internal_token_file: Path | None = None

    max_file_size_mb: int = Field(default=10, ge=1, le=50)
    log_level: str = "INFO"

    @model_validator(mode="after")
    def _load_token(self) -> "Settings":
        if self.internal_token_file:
            self.internal_token = self.internal_token_file.read_text(encoding="utf-8").strip()
        if len(self.internal_token) < MIN_TOKEN_LENGTH:
            raise ValueError(
                f"STEGO_INTERNAL_TOKEN debe tener al menos {MIN_TOKEN_LENGTH} caracteres"
            )
        return self

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
