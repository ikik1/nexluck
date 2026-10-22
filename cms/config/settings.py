import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
LOCAL = os.environ.get("CMS_ENV", "production") == "local"
DEBUG = LOCAL
SECRET_KEY = os.environ.get("CMS_SECRET_KEY", "")
if not SECRET_KEY:
    if not LOCAL:
        raise ImproperlyConfigured("Set CMS_SECRET_KEY in production.")
    SECRET_KEY = "local-development-only-not-for-deployment"
if not LOCAL and (len(SECRET_KEY) < 50 or SECRET_KEY.startswith("replace-")):
    raise ImproperlyConfigured("CMS_SECRET_KEY must be an independently generated secret of at least 50 characters.")
ALLOWED_HOSTS = os.environ.get("CMS_ALLOWED_HOSTS", "localhost,127.0.0.1" if LOCAL else "").split(",")
CSRF_TRUSTED_ORIGINS = list(filter(None, os.environ.get("CMS_CSRF_ORIGINS", "").split(",")))
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "core.apps.CoreConfig", "plugins.announcements.apps.AnnouncementsConfig",
]
# Extensions are installed Python packages, not database-supplied imports.
INSTALLED_APPS += list(filter(None, os.environ.get("CMS_PLUGIN_APPS", "").split(",")))
MIDDLEWARE = [
    "core.i18n.CMSLanguageMiddleware",
    "django.middleware.security.SecurityMiddleware", "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [BASE_DIR / "templates"],
    "APP_DIRS": True, "OPTIONS": {"context_processors": [
        "django.template.context_processors.request", "django.contrib.auth.context_processors.auth",
        "core.i18n.context",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
if LOCAL:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.environ.get("CMS_SQLITE_PATH", BASE_DIR / "local.sqlite3"), "OPTIONS": {"timeout": 20}}}
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "cms-local"}}
    SESSION_ENGINE = "django.contrib.sessions.backends.db"
else:
    for variable in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "CMS_REDIS_URL"):
        if not os.environ.get(variable):
            raise ImproperlyConfigured(f"Set {variable} in production.")
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql", "NAME": os.environ["POSTGRES_DB"],
        "USER": os.environ["POSTGRES_USER"], "PASSWORD": os.environ["POSTGRES_PASSWORD"],
        "HOST": os.environ.get("POSTGRES_HOST", "pool"), "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 0, "DISABLE_SERVER_SIDE_CURSORS": True,
        "OPTIONS": {"connect_timeout": 5, "prepare_threshold": None},
    }}
    CACHES = {"default": {"BACKEND": "django_redis.cache.RedisCache", "LOCATION": os.environ["CMS_REDIS_URL"],
                          "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"}}}
    SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"
SESSION_COOKIE_NAME = "nexluck_cms_session"
SESSION_COOKIE_PATH = "/cms/"
CSRF_COOKIE_NAME = "nexluck_cms_csrf"
CSRF_COOKIE_PATH = "/cms/"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not LOCAL
CSRF_COOKIE_SECURE = not LOCAL
SECURE_SSL_REDIRECT = not LOCAL
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000 if not LOCAL else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = not LOCAL
SECURE_HSTS_PRELOAD = not LOCAL
X_FRAME_OPTIONS = "DENY"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LOGIN_URL = "/cms/login/"
LOGIN_REDIRECT_URL = "/cms/"
LOGOUT_REDIRECT_URL = LOGIN_URL
STATIC_URL = "/cms/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "frontend" / "dist"] if (BASE_DIR / "frontend" / "dist").exists() else []
STORAGES = {"default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage" if LOCAL and os.environ.get("CMS_USE_MANIFEST") != "1"
                            else "whitenoise.storage.CompressedManifestStaticFilesStorage"}}
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "core.i18n.exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAdminUser"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle", "rest_framework.throttling.UserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "120/min", "user": "600/min"},
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 262144
USE_TZ = True
TIME_ZONE = "UTC"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
CRM_API_BASE = os.environ.get("CRM_API_BASE", "http://127.0.0.1:8086/crm/api/v1")
CRM_CLIENT_ID = os.environ.get("CRM_CLIENT_ID", "")
CRM_CLIENT_SECRET = os.environ.get("CRM_CLIENT_SECRET", "")
CRM_DEMO_UI = LOCAL and os.environ.get("CRM_DEMO_UI", "0") == "1"
LOGGING = {"version": 1, "disable_existing_loggers": False,
           "handlers": {"console": {"class": "logging.StreamHandler"}},
           "root": {"handlers": ["console"], "level": "INFO"}}
