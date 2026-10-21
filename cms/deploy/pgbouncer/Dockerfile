FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends pgbouncer python3 && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 10001 pool
COPY start.py /start.py
USER pool
CMD ["python3", "/start.py"]
