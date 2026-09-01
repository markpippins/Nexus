# syntax=docker/dockerfile:1
# timeclock — session clock-in/out REST service (FastAPI, :3600).
# Packaged for the vanadium deployment per architect ruling X2 (2026-08-23):
# R13 clock-in/out has been silently dead since the rehoming. Reads its DSN
# from CONDUIT_PG_DSN (see db.py). requires-python >=3.13 per pyproject.
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app/timeclock
COPY pyproject.toml ./
COPY main.py models.py db.py routes.py ./
RUN pip install "fastapi>=0.115.0" "uvicorn[standard]>=0.30.0" \
    "sqlalchemy>=2.0.0" "psycopg2-binary>=2.9.0" "pydantic>=2.0.0"

EXPOSE 3600
# Drop privileges: the base image runs as root by default.
RUN useradd --create-home --uid 10001 appuser && \
    chown -R appuser:appuser /app/timeclock
USER appuser
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3600"]
