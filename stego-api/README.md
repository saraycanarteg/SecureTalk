# SecureTalk – Stego API

Microservicio interno que analiza archivos multimedia (JPEG, PNG, MP3, MP4) para
detectar posibles alteraciones por esteganografía (RF-12, RS-14). Devuelve un
veredicto; la política (cuarentena/rechazo) la aplica el backend (RF-13).

## Desarrollo local

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
copy .env.example .env          # y completar STEGO_INTERNAL_TOKEN
pytest
uvicorn app.main:app --port 8001 --env-file .env
```

Documentación OpenAPI: http://127.0.0.1:8001/docs

## Docker

```bash
mkdir secrets
python -c "import secrets; print(secrets.token_urlsafe(48))" > secrets/stego_internal_token.txt
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build   # dev (puerto 8001)
docker compose up --build                                                   # aislado, sin puertos
```

La red `analysis` es `internal: true`: el contenedor no tiene salida a Internet
y solo es alcanzable por los servicios conectados a esa red (el backend).
