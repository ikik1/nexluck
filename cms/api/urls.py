from django.urls import path
from . import views

urlpatterns = [
    path("", views.docs),
    path("openapi.json", views.openapi),
    path("modules/", views.modules),
    path("segments/", views.segments),
    path("popular-catalog/", views.popular_catalog),
    path("get_promotion_bonuses/", views.get_promotion_bonuses),
]
