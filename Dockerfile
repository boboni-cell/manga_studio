FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Railway's proxy targets port 3000 by default (domain targetPort). The
# app must listen there even when Railway does not inject $PORT.
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-3000} --timeout 180 --workers 1 --threads 4"]
