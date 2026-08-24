# syntax=docker/dockerfile:1
# peb-kernel — Python Persistent Engineering Brain governance kernel.
# The ACTIVE kernel (replaced the JVM Spring implementation in the runtime
# path; JVM retained as reference). Packaged for the vanadium failover tier:
# FastAPI + psycopg2, stateless beyond PEB_DATABASE_URL — the kernel writes
# the shared `peb` schema, so a container here and the native unit there are
# interchangeable as long as they point at the same PostgreSQL.
#
#   docker build -t nexus-vanadium/peb-kernel .
#   docker run --rm -p 8098:8098 \
#     -e PEB_DATABASE_URL=postgresql://pguser:...@172.17.0.1:5432/nexus \
#     nexus-vanadium/peb-kernel
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
