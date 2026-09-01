FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY adapter.py .

# Expose port
EXPOSE 8001

# Run the adapter
# Drop privileges: the base image runs as root by default.
RUN useradd --create-home --uid 10001 appuser && \
    chown -R appuser:appuser /app
USER appuser
CMD ["python", "adapter.py"]
