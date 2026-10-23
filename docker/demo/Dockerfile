# Disposable public demo only. Never use this image for a household database.
# Follow the patched main backend used for the public demo; do not use the
# release-only latest tag, which can lag behind security fixes on main.
ARG BASE_IMAGE=ghcr.io/ditiskees/homelibrary-backend:main
FROM ${BASE_IMAGE}

COPY --chown=10001:10001 docker/demo/pb_migrations/209901010000_demo_seed.js /pb_migrations/
COPY --chown=10001:10001 docker/demo/entrypoint.sh /docker/demo/entrypoint.sh

ENV HOMELIBRARY_DEMO=1
EXPOSE 8090
# Parent image runs as unprivileged UID 10001 and provides /pb_data.
ENTRYPOINT ["/bin/sh", "/docker/demo/entrypoint.sh"]
CMD []
