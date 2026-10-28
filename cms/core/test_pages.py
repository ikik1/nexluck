from copy import deepcopy
from urllib.parse import urlsplit
from django.conf import settings
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
        url = f"/site/{self.site.public_slug}/about-us/"
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
        self.client.force_login(editor)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.other.pk}/pages/").status_code, 404)
        self.assertEqual(self.client.get(f"/site/{self.other.public_slug}/preview/1/").status_code, 404)
        self.assertEqual(self.client.post(self.base + "publish/", {"revision": 1}, format="json").status_code, 403)
        self.assertEqual(self.client.get(self.base + "draft/?page=bad").status_code, 400)

    def test_canonical_urls_and_preview_boundaries(self):
        self.assertEqual(self.site.public_slug, "pages")
        page_id = self.create(source_id=self.home.pk)
        doc = self.client.get(self.base + f"draft/?page={page_id}").data["document"]
        doc["slug"] = "unsaved-about"
        result = self.client.post(self.base + f"previews/?page={page_id}", doc, format="json")
        url = result.data["url"]
        self.assertEqual(urlsplit(url).path, "/site/pages/preview/1/unsaved-about/")
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(url.replace("/preview/1/", "/preview/2/")).status_code, 404)
        self.assertEqual(self.client.get(url.replace("/unsaved-about/", "/wrong/")).status_code, 404)
        self.assertEqual(self.client.get(url.replace("/site/pages/", "/site/other/")).status_code, 404)
        current = f"/site/pages/preview/1/about/"
        self.assertContains(self.client.get(current), f"page={page_id}")
        self.assertEqual(self.client.get(current.replace("/1/", "/2/")).status_code, 404)
        self.assertEqual(self.client.get(current + f"?page={self.home.pk}").status_code, 404)
        home_doc = self.client.get(self.base + "draft/").data["document"]
        preview = self.client.post(self.base + "previews/", home_doc, format="json")
        self.assertEqual(urlsplit(preview.data["url"]).path, "/site/pages/preview/1/")
        published = self.client.post(self.base + "publish/", {"revision": 1}, format="json")
        self.assertEqual(published.data["url"], "/site/pages/")
        self.assertEqual(self.client.get("/site/pages/").status_code, 200)
        self.assertContains(self.client.get("/site/pages/"), 'class="landing-brand" href="/site/pages/"')
        self.assertEqual(self.client.get(f"/cms/sites/{self.site.slug}/").status_code, 200)
        self.assertEqual(self.client.get("/site/pages/about/").status_code, 404)
        self.client.force_authenticate(None)
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 302)
        self.assertEqual(self.client.get(current).status_code, 302)

    def test_readable_slugs_and_root_scoped_authentication(self):
        first = import_site({"id": "CS-readable", "name": "Aurora Casino", "url": "https://readable.example", "enabled": True})
        second = import_site({"id": "CS-readable-copy", "name": "Aurora Casino", "url": "https://copy.example", "enabled": True})
        self.assertEqual(first.public_slug, "aurora-casino")
        self.assertEqual(second.public_slug, "aurora-casino-2")
        self.assertEqual(import_site({"id": first.crm_id}).public_slug, first.public_slug)
        self.assertEqual(self.client.cookies[settings.SESSION_COOKIE_NAME]["path"], "/")
        response = self.client.get(f"/site/{self.site.public_slug}/preview/1/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies[settings.CSRF_COOKIE_NAME]["path"], "/")
