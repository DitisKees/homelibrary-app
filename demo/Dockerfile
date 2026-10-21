# Disposable public demo only. Never use this image for a household database.
# Use an existing released production backend so app/schema versions stay aligned.
ARG BASE_IMAGE=ghcr.io/ditiskees/homelibrary-backend:latest
FROM ${BASE_IMAGE}

COPY --chown=10001:10001 demo/pb_migrations/209901010000_demo_seed.js /pb_migrations/
COPY --chown=10001:10001 demo/entrypoint.sh /demo/entrypoint.sh

ENV HOMELIBRARY_DEMO=1
EXPOSE 8090
# Parent image runs as unprivileged UID 10001 and provides /pb_data.
ENTRYPOINT ["/bin/sh", "/demo/entrypoint.sh"]
CMD []
