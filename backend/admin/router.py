import json
import os
import subprocess
import sys
from datetime import datetime, timezone
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
REFRESH_TIMEOUT_SECONDS = 1800
STALE_GRACE_SECONDS = 300


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: str | None):
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _process_exists(pid) -> bool:
    if not pid:
        return False

    try:
        os.kill(int(pid), 0)
    except (OSError, TypeError, ValueError):
        return False

    return True


def _normalize_state(state: dict) -> dict:
    normalized = {
        "status": state.get("status", "idle"),
        "trigger": state.get("trigger"),
        "started_at": state.get("started_at"),
        "finished_at": state.get("finished_at"),
        "duration_seconds": state.get("duration_seconds"),
        "last_error": state.get("last_error"),
        "runner_pid": state.get("runner_pid"),
    }

    if normalized["status"] != "running":
        return normalized

    started_at = _parse_iso_datetime(normalized["started_at"])
    now = datetime.now(timezone.utc)
    stale_after = REFRESH_TIMEOUT_SECONDS + STALE_GRACE_SECONDS
    pid_alive = _process_exists(normalized["runner_pid"])

    if started_at is None:
        return {
            **normalized,
            "status": "error",
            "finished_at": _utcnow_iso(),
            "duration_seconds": None,
            "last_error": "Refresh invalido: started_at ausente o corrupto",
        }

    elapsed = (now - started_at).total_seconds()
    if pid_alive and elapsed <= stale_after:
        return normalized

    return {
        **normalized,
        "status": "error",
        "finished_at": _utcnow_iso(),
        "duration_seconds": round(max(elapsed, 0), 1),
        "last_error": "Refresh atascado: no termino dentro del timeout esperado o el proceso ya no existe",
    }


def _write_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _read_state() -> dict:
    if not STATE_FILE.exists():
        return {
            "status": "idle",
            "trigger": None,
            "started_at": None,
            "finished_at": None,
            "duration_seconds": None,
            "last_error": None,
            "runner_pid": None,
        }
    try:
        raw_state = json.loads(STATE_FILE.read_text())
        normalized = _normalize_state(raw_state)
        if normalized != raw_state:
            _write_state(normalized)
        return normalized
    except (json.JSONDecodeError, OSError):
        return {"status": "idle", "last_error": "No se pudo leer el estado", "runner_pid": None}


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
