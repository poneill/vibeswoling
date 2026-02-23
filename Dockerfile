FROM python:3.10-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5.0 /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

COPY . .

ENV CSV_PATH=/data/lifts.csv

EXPOSE 5050

CMD ["uv", "run", "--no-dev", "python", "app.py"]
