"""Autenticación servicio a servicio (Zero Trust): toda petición de análisis
debe presentar el token interno compartido con el backend."""
import hmac

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


def require_internal_token(
    x_internal_token: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    # compare_digest evita ataques de temporización sobre el token.
    if not x_internal_token or not hmac.compare_digest(
        x_internal_token.encode(), settings.internal_token.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token interno inválido o ausente",
        )
