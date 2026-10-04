"""FastAPI app: serves the 3D dashboard and streams engine state over a websocket."""
from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .engine import Engine

WEB = Path(__file__).resolve().parent.parent / "web"


def create_app(engine: Engine) -> FastAPI:
    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(engine.run())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await asyncio.to_thread(engine.shutdown)

    app = FastAPI(title="Scalp City", lifespan=lifespan)

    @app.get("/api/state")
    def state():
        return engine.snapshot()

    @app.get("/api/chart/{worker_id}")
    def chart(worker_id: str):
        data = engine.chart(worker_id)
        if data is None:
            raise HTTPException(404, "unknown worker")
        return data

    @app.get("/api/account")
    def account():
        if not hasattr(engine.broker, "account"):
            return {"broker": engine.broker.name}
        return {"broker": engine.broker.name, **engine.broker.account()}

    @app.websocket("/ws")
    async def ws(socket: WebSocket):
        await socket.accept()
        q: asyncio.Queue = asyncio.Queue(maxsize=4)
        engine.subscribers.add(q)
        try:
            await socket.send_json(engine.snapshot())
            while True:
                await socket.send_json(await q.get())
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            engine.subscribers.discard(q)

    @app.get("/")
    def index():
        return FileResponse(WEB / "index.html")

    app.mount("/", StaticFiles(directory=WEB), name="web")
    return app
