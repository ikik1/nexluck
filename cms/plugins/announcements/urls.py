from django.urls import path
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response
from core.services import require_site
from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ["id", "title", "body", "is_public"]


@api_view(["GET", "POST"])
def announcements(request, site_id):
    site = require_site(request.user, site_id, publish=request.method == "POST")
    if request.method == "GET":
        return Response({"items": AnnouncementSerializer(Announcement.objects.filter(site=site).order_by("-created_at")[:100], many=True).data})
    serializer = AnnouncementSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(site=site)
    return Response(serializer.data, status=201)


urlpatterns = [path("api/plugins/announcements/<int:site_id>/", announcements, name="plugin-announcements")]
