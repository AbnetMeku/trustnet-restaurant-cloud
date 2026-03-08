#!/bin/sh
set -e

python - <<'PY'
import os
import socket
import time

host = os.environ.get("DB_HOST", "postgres")
port = int(os.environ.get("DB_PORT", "5432"))
deadline = time.time() + 60

while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(2)
else:
    raise SystemExit(f"Database {host}:{port} did not become ready in time")
PY

flask --app app.cloud_app:create_app db upgrade
python run.py
