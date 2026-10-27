from django.contrib import admin
from django.contrib.auth import views as auth
from django.urls import include, path
from core import views
from core.i18n import asset
from core.auth import CMSLoginView
from core.registry import registry

cms_urls = [
    path("i18n/<str:name>", asset),
    path("", views.editor, name="cms-editor"),
    path("login/", CMSLoginView.as_view(), name="login"),
    path("logout/", auth.LogoutView.as_view(), name="logout"),
    path("admin/", admin.site.urls),
    path("api/bootstrap/", views.bootstrap),
    path("api/", include("api.urls")),
    path("health/", views.health),
    path("api/crm-sites/", views.crm_sites),
    path("api/import/", views.import_crm),
    path("api/sites/<int:site_id>/draft/", views.draft),
    path("api/sites/<int:site_id>/previews/", views.create_preview),
    path("api/sites/<int:site_id>/publish/", views.publish),
    path("api/sites/<int:site_id>/widgets/<slug:key>/", views.draft_widget),
    path("api/sites/<int:site_id>/widgets/<slug:key>/favourites/", views.popular_favourite),
    path("api/public/<slug:slug>/<int:publication_id>/widgets/<slug:key>/", views.public_widget),
    path("api/public/<slug:slug>/<int:publication_id>/widgets/<slug:key>/favourites/", views.popular_favourite),
    path("preview/<int:site_id>/", views.preview),
    path("sites/<slug:slug>/", views.public_page),
    *registry.plugin_urls,
]
urlpatterns = [path("cms/", include(cms_urls))]
