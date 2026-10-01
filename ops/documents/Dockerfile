FROM python:3.12-slim-bookworm@sha256:782412e85d0f0984994c290652577d4018aff08145c85b262bb63dc0c7522254
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core fonts-noto-core util-linux poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py /app/server.py
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1 SAL_USE_VCLPLUGIN=svp
USER 1000:1000
CMD ["flock", "--nonblock", "--no-fork", "/run/documents/worker.lock", "python", "/app/server.py"]
