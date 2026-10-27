from copy import deepcopy
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Page, SiteMember
from .services import document_for, publish_page
from .starter import import_site


class PageManagementTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser("pages-test", password="pages-test-password")
        self.site = import_site({"id": "CS-pages", "name": "Pages", "url": "https://pages.example", "enabled": True, "theme": "dark"})
        self.other = import_site({"id": "CS-other", "name": "Other", "url": "https://other.example", "enabled": True, "theme": "dark"})
        self.home = Page.objects.get(site=self.site, slug="home")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.force_login(self.user)
        self.base = f"/cms/api/sites/{self.site.pk}/"

    def create(self, **values):
        response = self.client.post(self.base + "pages/", {"title": "About", "slug": "about", **values}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_blank_copy_and_unique_slugs(self):
        blank = self.create()
        self.assertEqual(Page.objects.get(pk=blank).blocks.count(), 0)
        copied = self.create(title="Copied", slug="copied", source_id=self.home.pk)
        self.assertEqual(Page.objects.get(pk=copied).blocks.count(), self.home.blocks.count())
        self.assertIsNone(Page.objects.get(pk=copied).published_id)
        for slug in ("about", "home", "../bad", ""):
            response = self.client.post(self.base + "pages/", {"title": "Invalid", "slug": slug}, format="json")
            self.assertEqual(response.status_code, 400)
        foreign = Page.objects.get(site=self.other, slug="home")
        self.assertEqual(self.client.post(self.base + "pages/", {"title": "Foreign", "slug": "foreign", "source_id": foreign.pk}, format="json").status_code, 404)

    def test_page_edit_publish_preview_and_home_isolation(self):
        publish_page(self.home.pk, 1, self.user)
        original = deepcopy(document_for(self.home))
        page_id = self.create(source_id=self.home.pk)
        endpoint = self.base + f"draft/?page={page_id}"
        doc = self.client.get(endpoint).data["document"]
        doc.update(title="About updated", slug="about-us", theme="modern", menu=[{"label": "Home", "href": "/"}])
        doc["blocks"][0]["props"]["title"] = "Only this page"
        response = self.client.patch(endpoint, doc, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["document"]["slug"], "about-us")
        self.home.refresh_from_db()
        self.assertEqual(document_for(self.home), original)
        self.assertEqual(self.client.patch(endpoint, doc, format="json").status_code, 409)
        preview = self.client.post(self.base + f"previews/?page={page_id}", response.data["document"], format="json")
        self.assertEqual(preview.status_code, 200, preview.data)
        html = self.client.get(preview.data["url"])
        self.assertContains(html, "Only this page")
        self.assertContains(html, f"page={page_id}")
        self.assertEqual(self.client.get(preview.data["url"].replace(f"page={page_id}", f"page={self.home.pk}")).status_code, 404)
        url = f"/cms/sites/{self.site.slug}/about-us/"
        self.assertEqual(self.client.get(url).status_code, 404)
        publication = self.client.post(self.base + f"publish/?page={page_id}", {"revision": 2}, format="json")
        self.assertEqual(publication.status_code, 200)
        self.assertEqual(publication.data["url"], url)
        self.assertContains(self.client.get(url), "Only this page")
        self.assertNotContains(self.client.get(f"/cms/sites/{self.site.slug}/"), "Only this page")

    def test_page_access_and_permissions(self):
        foreign = Page.objects.get(site=self.other)
        for suffix in ("draft/", "widgets/games-3/", "previews/", "publish/"):
            method = self.client.get if suffix in ("draft/", "widgets/games-3/") else self.client.post
            response = method(self.base + suffix + f"?page={foreign.pk}", {"revision": 1}, format="json") if method == self.client.post else method(self.base + suffix + f"?page={foreign.pk}")
            self.assertIn(response.status_code, (400, 404))
        editor = get_user_model().objects.create_user("pages-editor", is_staff=True)
        SiteMember.objects.create(site=self.site, user=editor)
        self.client.force_authenticate(editor)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.other.pk}/pages/").status_code, 404)
        self.assertEqual(self.client.post(self.base + "publish/", {"revision": 1}, format="json").status_code, 403)
        self.assertEqual(self.client.get(self.base + "draft/?page=bad").status_code, 400)
