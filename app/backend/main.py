"""Small FastAPI service used by the NexusOps container workflow."""

from fastapi import FastAPI


app = FastAPI(title="NexusOps Sample API")


@app.get("/", tags=["service"])
def root() -> dict[str, str]:
    return {"service": "NexusOps Sample API", "status": "running"}


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
