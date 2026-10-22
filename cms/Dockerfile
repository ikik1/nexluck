FROM node:22-bookworm-slim AS frontend
WORKDIR /source/cms/frontend
COPY cms/frontend/package*.json ./
RUN npm ci
COPY cms/frontend/ ./
COPY styles.css landing.css dropdowns.css /source/
COPY h/home.css /source/h/home.css
COPY h/art.js /source/h/art.js
COPY crm/c/SegmentSelection.js /source/crm/c/SegmentSelection.js
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY cms/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home --uid 10001 cms
COPY cms/ .
COPY localization /localization
COPY --from=frontend /source/cms/frontend/dist ./frontend/dist
RUN CMS_ENV=local CMS_USE_MANIFEST=1 python manage.py collectstatic --noinput && chown -R cms:cms /app
USER cms
EXPOSE 8090
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8090", "--workers", "3", "--threads", "4", "--timeout", "30", "--access-logfile", "-", "--error-logfile", "-"]
