"""Servicio de detección de esteganografía de SecureTalk (RF-12, RS-14)."""
import logging

from fastapi import FastAPI

from app.api import health
from app.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    app = FastAPI(
        title="SecureTalk Stego API",
        version="0.1.0",
        description="Análisis estructural y estadístico de archivos multimedia "
        "para detectar posibles alteraciones por esteganografía.",
    )
    app.include_router(health.router)
    return app


app = create_app()
