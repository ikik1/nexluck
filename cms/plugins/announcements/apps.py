from django.apps import AppConfig


class AnnouncementsConfig(AppConfig):
    name = "plugins.announcements"
    label = "announcements"

    def ready(self):
        from core.modules import validate_props
        from core.registry import Module, registry
        from .data import announcement_data
        from .urls import urlpatterns
        registry.register(Module("announcements.notice", "Announcements (plugin)", validate_props, announcement_data))
        registry.plugin_urls.extend(urlpatterns)
