import json
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..auth.utils import get_current_user
from ..database import get_pool
from ..predictions.service import backfill_predictions

router = APIRouter(prefix="/api/admin", tags=["admin"])

PROJECT_DIR = Path(__file__).resolve().parents[2]
STATE_FILE = PROJECT_DIR / "data" / "refresh_state.json"
RUNNER = PROJECT_DIR / "scripts" / "run_refresh.py"
VENV_PYTHON = PROJECT_DIR / "venv" / "bin" / "python"


def _read_state() -> dict:
    if not STATE_FILE.exists():
        return {
            "status": "idle",
            "trigger": None,
            "started_at": None,
            "finished_at": None,
            "duration_seconds": None,
            "last_error": None,
        }
    try:
        return json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"status": "idle", "last_error": "No se pudo leer el estado"}


@router.get("/refresh/status")
async def refresh_status(_user=Depends(get_current_user)):
    return _read_state()


@router.post("/refresh")
async def trigger_refresh(_user=Depends(get_current_user)):
    state = _read_state()
    if state.get("status") == "running":
        raise HTTPException(status_code=409, detail="Ya hay un refresh en curso")

    python = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    subprocess.Popen(
        [python, str(RUNNER), "--trigger", "manual"],
        cwd=str(PROJECT_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"status": "started"}


@router.get("/predictions/status")
async def predictions_status(_user=Depends(get_current_user)):
    pool = await get_pool()
    summary = await pool.fetchrow("""
        SELECT
            COUNT(*) AS predictions_total,
            COUNT(DISTINCT model_version) AS model_versions,
            MAX(created_at) AS last_generated_at
        FROM predictions
    """)
    top_accuracy = await pool.fetch("""
        SELECT model_version, COUNT(*) AS player_rows, ROUND(AVG(mae)::numeric, 2) AS avg_mae
        FROM v_prediction_accuracy
        GROUP BY model_version
        ORDER BY avg_mae ASC NULLS LAST, model_version ASC
        LIMIT 5
    """)
    return {
        **dict(summary),
        "accuracy_models": [dict(row) for row in top_accuracy],
    }


@router.post("/predictions/backfill")
async def trigger_prediction_backfill(_user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            summary = await backfill_predictions(conn)
    return summary
