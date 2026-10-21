from django.contrib import admin
from .models import Layout, NavigationMenu, Plugin, Site, SiteMember, Theme

# Page/ContentBlock/Publication writes go through the revision-aware editor.
class SuperuserAdmin(admin.ModelAdmin):
    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    has_add_permission = has_view_permission
    has_change_permission = has_view_permission
    has_delete_permission = has_view_permission


for model in [Theme, Layout, Site, SiteMember, Plugin, NavigationMenu]:
    admin.site.register(model, SuperuserAdmin)
admin.site.site_header = "NexLuck CMS administration"
