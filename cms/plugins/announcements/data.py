from .models import Announcement


def announcement_data(site, props):
    return {"items": list(Announcement.objects.filter(site=site, is_public=True).order_by("-created_at", "-id")
                          .values("id", "title", "body")[:props.get("limit", 8)]), "source": "Announcements plugin"}
