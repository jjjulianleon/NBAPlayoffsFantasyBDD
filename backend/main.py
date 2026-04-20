from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import get_pool, close_pool
from .auth.router import router as auth_router
from .players.router import router as players_router
from .fantasy.router import router as fantasy_router
from .predictions.router import router as predictions_router
from .predictions.scouting import router as scouting_router
from .admin.router import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(
    title="Playoff Hoops API",
    description="Fantasy Basketball Playoffs — USFQ CMP 4002",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(players_router)
app.include_router(fantasy_router)
app.include_router(predictions_router)
app.include_router(scouting_router)
app.include_router(admin_router)


@app.get("/api/health")
async def health():
    pool = await get_pool()
    version = await pool.fetchval("SELECT version()")
    counts = await pool.fetchrow("""
        SELECT
            (SELECT COUNT(*) FROM players) AS players,
            (SELECT COUNT(*) FROM games) AS games,
            (SELECT COUNT(*) FROM player_game_stats) AS stats,
            (SELECT COUNT(*) FROM nba_teams) AS teams
    """)
    return {
        "status": "ok",
        "db": version,
        "counts": dict(counts),
    }
