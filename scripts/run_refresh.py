"""
Wrapper de refresh que mantiene estado compartido entre:
- Endpoint manual del backend (POST /api/admin/refresh)
- Systemd user timer (auto)

Escribe data/refresh_state.json con el estado actual para que el
frontend pueda mostrar "en curso", "ultimo exitoso hace Xh", etc.
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
STATE_FILE = PROJECT_DIR / "data" / "refresh_state.json"
REFRESH_SCRIPT = PROJECT_DIR / "scripts" / "refresh_nba.sh"
REFRESH_TIMEOUT_SECONDS = 1800
STALE_GRACE_SECONDS = 300


def utcnow_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value):
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def process_exists(pid):
    if not pid:
        return False

    try:
        os.kill(int(pid), 0)
    except (OSError, TypeError, ValueError):
        return False

    return True


def normalize_state(state):
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

    started_at = parse_iso_datetime(normalized["started_at"])
    now = datetime.now(timezone.utc)
    stale_after = REFRESH_TIMEOUT_SECONDS + STALE_GRACE_SECONDS
    pid_alive = process_exists(normalized["runner_pid"])

    if started_at is None:
        return {
            **normalized,
            "status": "error",
            "finished_at": utcnow_iso(),
            "duration_seconds": None,
            "last_error": "Refresh invalido: started_at ausente o corrupto",
        }

    elapsed = (now - started_at).total_seconds()
    if pid_alive and elapsed <= stale_after:
        return normalized

    return {
        **normalized,
        "status": "error",
        "finished_at": utcnow_iso(),
        "duration_seconds": round(max(elapsed, 0), 1),
        "last_error": "Refresh atascado: no termino dentro del timeout esperado o el proceso ya no existe",
    }


def read_state():
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
        return normalize_state(json.loads(STATE_FILE.read_text()))
    except (json.JSONDecodeError, OSError):
        return {"status": "idle", "runner_pid": None}


def write_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trigger", choices=["manual", "auto"], default="manual")
    args = parser.parse_args()

    current = read_state()
    if current.get("status") == "running":
        print("Ya hay un refresh en curso", file=sys.stderr)
        return 2

    started = utcnow_iso()
    write_state({
        "status": "running",
        "trigger": args.trigger,
        "started_at": started,
        "finished_at": None,
        "duration_seconds": None,
        "last_error": None,
        "runner_pid": os.getpid(),
    })

    start_ts = datetime.now(timezone.utc)
    rc = 0
    last_error = None
    try:
        proc = subprocess.run(
            [str(REFRESH_SCRIPT)],
            cwd=str(PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=REFRESH_TIMEOUT_SECONDS,
        )
        rc = proc.returncode
        if rc != 0:
            tail = (proc.stderr or proc.stdout or "")[-800:]
            last_error = tail.strip() or f"exit code {rc}"
    except subprocess.TimeoutExpired:
        rc = 124
        last_error = "Timeout: el refresh tardo mas de 30 minutos"
    except Exception as exc:
        rc = 1
        last_error = f"{type(exc).__name__}: {exc}"

    finished = utcnow_iso()
    duration = (datetime.now(timezone.utc) - start_ts).total_seconds()

    write_state({
        "status": "success" if rc == 0 else "error",
        "trigger": args.trigger,
        "started_at": started,
        "finished_at": finished,
        "duration_seconds": round(duration, 1),
        "last_error": last_error,
        "runner_pid": None,
    })

    return rc


if __name__ == "__main__":
    sys.exit(main())
