# syntax=docker/dockerfile:1
# peb-kernel — Python governance kernel (FastAPI + psycopg2, peb schema writer).
FROM python:3.12-slim

WORKDIR /app

# Dependencies first for layer caching
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

ENV PEB_PORT=8098 \
    PEB_HOST=0.0.0.0 \
    PEB_STORE=postgres

EXPOSE 8098

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8098/actuator/health',timeout=4)" || exit 1

CMD ["python", "-m", "peb_kernel.main"]
