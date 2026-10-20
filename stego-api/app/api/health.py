"""Endpoints de supervisión (RNF-15). No requieren token para que el
orquestador de contenedores pueda consultarlos."""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness: el proceso está vivo")
def health() -> dict:
    return {"status": "ok"}


@router.get("/ready", summary="Readiness: el servicio puede analizar archivos")
def ready() -> JSONResponse:
    checks = {"numpy": _can_import("numpy"), "pillow": _can_import("PIL"), "jpeglib": _can_import("jpeglib")}
    ok = all(checks.values())
    return JSONResponse(
        status_code=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if ok else "not_ready", "checks": checks},
    )


def _can_import(module: str) -> bool:
    try:
        __import__(module)
        return True
    except ImportError:
        return False
