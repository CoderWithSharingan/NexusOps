"""Local-only NexusOps web UI. Exposes safe actions only; plan, apply, build and push stay in the CLI."""

import json
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.middleware.trustedhost import TrustedHostMiddleware

import run_nexusops as core

HOST = "127.0.0.1"
PORT = 8765
DEV_PORT = 5173
DIST_DIR = Path(__file__).resolve().parent / "frontend" / "dist"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
}


class ConfigBody(BaseModel):
    config: dict[str, Any]


def allowed_origins(port=PORT):
    return {
        f"http://{host}:{each}"
        for host in ("127.0.0.1", "localhost")
        for each in (port, DEV_PORT)
    }


def _load_or_http_error():
    try:
        return core.load_config()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _load_valid_or_http_error():
    config = _load_or_http_error()
    errors = core.validate_config(config)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    return config


def create_app(dist_dir=DIST_DIR, port=PORT):
    dist_dir = Path(dist_dir).resolve()
    origins = allowed_origins(port)
    write_lock = threading.Lock()
    app = FastAPI(title="NexusOps UI", docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def guard_origin_and_add_headers(request: Request, call_next):
        # Blocks other websites in the same browser from triggering writes on this local server.
        if request.method not in SAFE_METHODS and request.headers.get("origin") not in origins:
            response = JSONResponse({"detail": "Request origin is not allowed."}, status_code=403)
        else:
            response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

    # Added last so it runs first; rejects DNS-rebinding requests with foreign Host headers.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.get("/api/status")
    def status():
        try:
            config = core.load_config()
        except ValueError as error:
            config, errors = {}, [str(error)]
        else:
            errors = core.validate_config(config)
        resources = config.get("resources") if isinstance(config.get("resources"), dict) else {}
        application = config.get("application") if isinstance(config.get("application"), dict) else {}

        def enabled(name):
            section = resources.get(name)
            return isinstance(section, dict) and section.get("enabled") is True

        plan_error = core.plan_freshness_error()
        return {
            "application": application.get("name") if isinstance(application.get("name"), str) else None,
            "config": {"valid": not errors, "errors": errors},
            "plan": {"fresh": plan_error is None, "message": plan_error or "Saved plan matches current inputs."},
            "variables_generated": core.VARIABLES_FILE.is_file(),
            "manifests_rendered": (core.KUBERNETES_DIR / "manifests.yaml").is_file(),
            "resources": {"s3": enabled("s3"), "ecr": enabled("ecr")},
        }

    @app.get("/api/config")
    def read_config():
        return {"config": _load_or_http_error()}

    @app.put("/api/config")
    def write_config(body: ConfigBody):
        with write_lock:
            errors = core.save_config(body.config)
        if errors:
            raise HTTPException(status_code=422, detail={"errors": errors})
        return {"saved": True}

    @app.post("/api/validate")
    def validate_draft(body: ConfigBody):
        errors = core.validate_config(body.config)
        return {"valid": not errors, "errors": errors}

    @app.post("/api/generate")
    def generate():
        with write_lock:
            config = _load_valid_or_http_error()
            core.generate_terraform_variables(config)
            core.write_backend_config(config)
        return {"variables": json.loads(core.VARIABLES_FILE.read_text(encoding="utf-8"))}

    @app.post("/api/render-k8s")
    def render_kubernetes():
        with write_lock:
            config = _load_valid_or_http_error()
            try:
                output = core.write_kubernetes_manifests(config)
            except ValueError as error:
                raise HTTPException(status_code=422, detail={"errors": [str(error)]}) from error
        return {"manifests": Path(output).read_text(encoding="utf-8")}

    @app.get("/api/plan")
    def plan():
        message = core.plan_freshness_error()
        if message:
            return {"fresh": False, "message": message, "text": None}
        try:
            text = core.saved_plan_text()
        except ValueError as error:
            return {"fresh": False, "message": str(error), "text": None}
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return {"fresh": True, "message": "Saved plan matches current inputs.", "text": text}

    @app.get("/{full_path:path}", include_in_schema=False)
    def single_page_app(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        index = dist_dir / "index.html"
        if not index.is_file():
            return PlainTextResponse(
                "The web UI is not built. Run 'npm run build' in webui/frontend.", status_code=503
            )
        candidate = (dist_dir / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist_dir):
            return FileResponse(candidate)
        return FileResponse(index)

    return app


def serve(port=PORT):
    import uvicorn

    print(f"NexusOps UI running at http://{HOST}:{port} (press Ctrl+C to stop)")
    uvicorn.run(create_app(port=port), host=HOST, port=port, log_level="warning")
    return 0
