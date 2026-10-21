from django.db import models


class Announcement(models.Model):
    site = models.ForeignKey("core.Site", on_delete=models.CASCADE)
    title = models.CharField(max_length=160)
    body = models.TextField(max_length=2000)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["site", "is_public", "-created_at"], name="cms_announcement_feed_idx")]
