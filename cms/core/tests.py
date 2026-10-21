from copy import deepcopy
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from core.crm import CRMUnavailable
from core.models import Layout, Page, Plugin, SiteMember, Theme
from core.registry import registry
from core.services import document_for, publish_page
from core.starter import import_site
from plugins.announcements.models import Announcement


class CMSTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = get_user_model().objects.create_superuser("admin", "admin@example.test", "test-only-long-password")
        self.editor = get_user_model().objects.create_user("editor", is_staff=True)
        self.other = get_user_model().objects.create_user("other", is_staff=True)
        self.site = import_site({"id": "CS-0000000000000001", "name": "Aurora", "url": "https://aurora.example", "theme": "dark", "enabled": True})
        self.site2 = import_site({"id": "CS-0000000000000002", "name": "Coast", "url": "https://coast.example", "theme": "classic", "enabled": True})
        SiteMember.objects.create(site=self.site, user=self.editor)
        self.page = Page.objects.select_related("layout", "site__theme").prefetch_related("blocks", "site__menus").get(site=self.site)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.url = f"/cms/api/sites/{self.site.id}/draft/"

    def document(self):
        self.page.refresh_from_db()
        return document_for(self.page)

    def test_import_is_idempotent(self):
        again = import_site({"id": self.site.crm_id})
        self.assertEqual(again.id, self.site.id)
        self.assertEqual(self.page.blocks.count(), 15)
        self.assertIn("announcements.notice", registry.modules)
        self.assertEqual(set(registry.layouts), {"home", "compact"})
        long_name_site = import_site({"id": "CS-0000000000000003", "name": "A" * 120,
                                     "url": "https://long.example", "theme": "dark", "enabled": True})
        self.assertLessEqual(len(long_name_site.slug), 50)

    def test_demo_layout_and_modules_are_available(self):
        self.assertEqual(Layout.objects.get(key="home").name, "NexLuck Demo Layout")
        self.assertTrue({"header_profile", "tab_menu", "main_menu", "seo"} <= set(self.page.blocks.values_list("kind", flat=True)))
        response = self.client.get("/cms/api/modules/")
        schemas = {s["key"]: s for s in response.data["items"]}
        self.assertEqual(schemas["promotions"]["properties"]["custom_segment"]["widget"], "crm-segments")
        self.assertEqual(schemas["seo"]["properties"]["html"]["widget"], "html")
        self.assertEqual(self.client.get("/cms/api/openapi.json").data["openapi"], "3.0.3")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/cms/api/modules/").status_code, 403)

    def test_existing_page_module_upgrade_preserves_publication_and_is_idempotent(self):
        import importlib
        from django.apps import apps
        self.page.blocks.filter(kind__in=["header_profile", "tab_menu", "main_menu", "seo"]).delete()
        publication = publish_page(self.page.id, 1, self.admin)
        snapshot = deepcopy(publication.document)
        upgrade = importlib.import_module("core.migrations.0002_demo_modules").upgrade
        upgrade(apps, None)
        upgrade(apps, None)
        self.page.refresh_from_db()
        publication.refresh_from_db()
        self.assertEqual(self.page.blocks.count(), 15)
        self.assertEqual(self.page.revision, 2)
        self.assertEqual(publication.document, snapshot)

    @patch("core.crm.crm_get")
    def test_promotion_method_filters_all_ids_segments_and_sorts(self, get):
        bonuses = [
            {"id": "BN-1", "name": "VIP old", "status": "active", "createdAt": "2026-01-01", "groups": ["VIP"]},
            {"id": "BN-2", "name": "VIP new", "status": "active", "createdAt": "2026-02-01", "groups": ["VIP"]},
            {"id": "BN-3", "name": "Public", "status": "active", "createdAt": "2026-03-01", "groups": []},
            {"id": "BN-4", "name": "Other", "status": "active", "createdAt": "2026-04-01", "groups": ["REGISTERED"]},
            {"id": "BN-5", "name": "Disabled", "status": "inactive", "createdAt": "2026-05-01", "groups": []},
            {"id": "BN-6", "name": "Deleted", "status": "active", "deleted": True, "createdAt": "2026-06-01", "groups": []},
        ]
        get.side_effect = lambda path, **kwargs: [{"id": "SG-1", "name": "VIP"}] if path == "segments" else bonuses
        response = self.client.get("/cms/api/get_promotion_bonuses/", {
            "site_id": self.site.id,
            "custom_segment": ["SG-1"], "total": 1, "sort_by": "created_at",
            "bonus_external_ids": ["BN-1", "BN-2"],
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["items"], [{"id": "BN-2", "external_id": "BN-2", "name": "VIP new", "created_at": "2026-02-01"}])
        get.assert_any_call("bonuses", casino_id=self.site.crm_id, paginate=True)
        for params in [{"total": 0}, {"total": 41}, {"sort_by": "name"}, {"unknown": "x"}, {"custom_segment": ["SG-missing"]}]:
            self.assertEqual(self.client.get("/cms/api/get_promotion_bonuses/", {"site_id": self.site.id, **params}).status_code, 400)
        response = self.client.get("/cms/api/get_promotion_bonuses/", {"site_id": self.site.id, "custom_segment": ["SG-1"]})
        self.assertEqual([b["id"] for b in response.data["items"]], ["BN-3", "BN-2", "BN-1"])

    @patch("core.crm.httpx.Client")
    @override_settings(CRM_DEMO_UI=True)
    def test_crm_bonus_pagination_reaches_past_first_page(self, client):
        from core.crm import crm_get
        from unittest.mock import Mock
        responses = [Mock(), Mock()]
        responses[0].json.return_value = {"items": [{"id": "BN-1"}], "total": 2}
        responses[1].json.return_value = {"items": [{"id": "BN-2"}], "total": 2}
        session = client.return_value.__enter__.return_value
        session.get.side_effect = responses
        self.assertEqual(crm_get("bonuses", casino_id=self.site.crm_id, paginate=True), [{"id": "BN-1"}, {"id": "BN-2"}])
        self.assertTrue(session.get.call_args_list[1].args[0].endswith("limit=100&offset=1"))
        for call in session.get.call_args_list:
            self.assertEqual(call.kwargs["headers"]["X-Casino-Id"], self.site.crm_id)

    @patch("core.crm.httpx.Client")
    @override_settings(CRM_CLIENT_ID="test-client", CRM_CLIENT_SECRET="test-secret")
    def test_crm_headers_scope_every_feed_but_not_casino_registry(self, client):
        from core.crm import crm_get
        session = client.return_value.__enter__.return_value
        session.get.return_value.json.return_value = {"items": []}
        session.post.return_value.json.return_value = {"access_token": "test-token", "expires_in": 900}
        for demo in (True, False):
            with self.settings(CRM_DEMO_UI=demo):
                for site in (self.site, self.site2):
                    for path in ("games", "games/categories", "games/publishers", "bonuses", "segments"):
                        crm_get(path, casino_id=site.crm_id)
                        headers = session.get.call_args.kwargs["headers"]
                        self.assertEqual(headers["X-Casino-Id"], site.crm_id)
                        if not demo:
                            self.assertEqual(headers["Authorization"], "Bearer test-token")
                crm_get("casinos")
                self.assertNotIn("X-Casino-Id", session.get.call_args.kwargs["headers"])
        self.assertEqual(session.post.call_count, 1)
        count = session.get.call_count
        for owner in (None, "", " "):
            with self.assertRaises(CRMUnavailable):
                crm_get("games", casino_id=owner)
        self.assertEqual(session.get.call_count, count)

    @patch("core.crm.crm_get")
    def test_staff_catalog_endpoints_require_authorized_site(self, get):
        get.return_value = [{"id": "SG-1", "name": "VIP"}]
        self.client.force_authenticate(self.editor)
        for endpoint in ("segments", "get_promotion_bonuses"):
            url = f"/cms/api/{endpoint}/"
            for params in ({}, {"site_id": "invalid"}, {"site_id": 0}):
                self.assertEqual(self.client.get(url, params).status_code, 400)
            self.assertEqual(self.client.get(url, {"site_id": self.site2.id}).status_code, 404)
        get.assert_not_called()
        self.assertEqual(self.client.get("/cms/api/segments/", {"site_id": self.site.id}).status_code, 200)
        get.assert_called_once_with("segments", casino_id=self.site.crm_id)

    @patch("core.crm.crm_get")
    def test_two_site_widgets_and_staff_feeds_have_isolated_catalog_caches(self, get):
        def catalog(path, *, casino_id, **kwargs):
            suffix = "A" if casino_id == self.site.crm_id else "B"
            if path == "segments":
                return [{"id": f"SG-{suffix}", "name": suffix}]
            if path == "bonuses":
                return [{"id": f"BN-{suffix}", "name": suffix, "status": "active",
                         "createdAt": "2026-01-01", "groups": [suffix]}]
            if path == "games":
                return [{"id": f"GM-{suffix}", "name": suffix, "enabled": True,
                         "publisher_id": f"PR-{suffix}", "category_ids": [f"CAT-{suffix}"]}]
            return [{"id": f"{'CAT' if path.endswith('categories') else 'PR'}-{suffix}",
                     "name": suffix, "kind": "static"}]
        get.side_effect = catalog
        cache.set("cms:catalog:v1:games", [{"id": "legacy-global"}])
        cache.set("cms:promotion-bonuses:v1", [{"id": "legacy-global"}])
        for site, suffix in ((self.site, "A"), (self.site2, "B")):
            page = Page.objects.get(site=site)
            publication = publish_page(page.id, 1, self.admin)
            for key, expected in (("games-3", "GM"), ("categories-2", "CAT"),
                                  ("providers-5", "PR"), ("promotions-1", "BN")):
                for url in (f"/cms/api/sites/{site.id}/widgets/{key}/",
                            f"/cms/api/public/{site.slug}/{publication.id}/widgets/{key}/"):
                    response = self.client.get(url)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual([item["id"] for item in response.data["items"]], [f"{expected}-{suffix}"])
            response = self.client.get("/cms/api/segments/", {"site_id": site.id})
            self.assertEqual(response.data["items"], [{"id": f"SG-{suffix}", "name": suffix}])
            response = self.client.get("/cms/api/get_promotion_bonuses/", {
                "site_id": site.id, "custom_segment": [f"SG-{suffix}"]})
            self.assertEqual([item["id"] for item in response.data["items"]], [f"BN-{suffix}"])
            response = self.client.get("/cms/api/get_promotion_bonuses/", {
                "site_id": site.id, "custom_segment": [f"SG-{'B' if suffix == 'A' else 'A'}"]})
            self.assertEqual(response.status_code, 400)
        for owner in (self.site.crm_id, self.site2.crm_id):
            for path in ("games", "games/categories", "games/publishers", "bonuses"):
                calls = [call for call in get.call_args_list
                         if call.args == (path,) and call.kwargs["casino_id"] == owner]
                self.assertEqual(len(calls), 1)
        # Returning to the first site must read its own warm cache, not the last site's data.
        response = self.client.get(f"/cms/api/sites/{self.site.id}/widgets/games-3/")
        self.assertEqual(response.data["items"][0]["id"], "GM-A")

    @patch("core.crm.httpx.Client")
    def test_unlinked_site_feeds_fail_without_crm_requests_or_global_cache(self, client):
        self.site.crm_id = ""
        self.site.save(update_fields=["crm_id"])
        publication = publish_page(self.page.id, 1, self.admin)
        for key in ("games-3", "categories-2", "providers-5", "promotions-1"):
            for url in (f"/cms/api/sites/{self.site.id}/widgets/{key}/",
                        f"/cms/api/public/{self.site.slug}/{publication.id}/widgets/{key}/"):
                self.assertEqual(self.client.get(url).status_code, 503)
        for endpoint in ("segments", "get_promotion_bonuses"):
            response = self.client.get(f"/cms/api/{endpoint}/", {"site_id": self.site.id})
            self.assertEqual(response.status_code, 503)
            self.assertIn("not linked", response.data["detail"])
        client.assert_not_called()

    def test_seo_html_is_sanitized_and_remains_ssr(self):
        doc = self.document()
        block = next(b for b in doc["blocks"] if b["kind"] == "seo")
        block["props"]["html"] = '<h2>Find games</h2><p onclick="evil()">Safe</p><script>evil()</script><a href="javascript:evil()">Bad URL</a>'
        response = self.client.patch(self.url, doc, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        stored = next(b for b in response.data["document"]["blocks"] if b["kind"] == "seo")["props"]["html"]
        self.assertIn("<h2>Find games</h2>", stored)
        for unsafe in ["onclick", "<script", "javascript:"]:
            self.assertNotIn(unsafe, stored)
        publish_page(self.page.id, 2, self.admin)
        self.assertContains(self.client.get(f"/cms/sites/{self.site.slug}/"), "<h2>Find games</h2>", html=True)

    @patch("core.views.crm_get")
    def test_website_selector_is_crm_sourced_and_permission_filtered(self, get):
        get.return_value = [{"id": self.site.crm_id, "name": "CRM renamed Aurora", "enabled": True},
                            {"id": self.site2.crm_id, "name": "Coast", "enabled": True},
                            {"id": "CS-new", "name": "New CRM casino", "enabled": False}]
        response = self.client.get("/cms/api/crm-sites/")
        self.assertEqual(len(response.data["items"]), 3)
        self.assertEqual(response.data["items"][0]["name"], "CRM renamed Aurora")
        self.assertIsNone(response.data["items"][2]["id"])
        self.client.force_authenticate(self.editor)
        self.assertEqual([s["crm_id"] for s in self.client.get("/cms/api/crm-sites/").data["items"]], [self.site.crm_id])

    def test_anonymous_and_nonstaff_cannot_edit(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, [401, 403])
        self.assertIn(self.client.get(f"/cms/api/sites/{self.site.id}/widgets/games-3/").status_code, [401, 403])
        user = get_user_model().objects.create_user("player")
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.get("/cms/api/bootstrap/").status_code, 403)

    def test_site_boundary_and_publisher_permission(self):
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.site2.id}/draft/").status_code, 404)
        self.assertEqual(self.client.post(f"/cms/api/sites/{self.site.id}/publish/", {"revision": 1}).status_code, 403)
        self.assertEqual(self.client.post("/cms/api/import/", {"crm_id": self.site.crm_id}).status_code, 403)
        self.assertEqual(self.client.get("/cms/api/bootstrap/").data["sites"][0]["can_publish"], False)

    def test_save_conflict_and_immutable_publication(self):
        doc = self.document()
        original = deepcopy(doc)
        doc["title"] = "Edited draft"
        response = self.client.patch(self.url, doc, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["document"]["revision"], 2)
        self.assertEqual(self.client.patch(self.url, original, format="json").status_code, 409)
        published = self.client.post(f"/cms/api/sites/{self.site.id}/publish/", {"revision": 2})
        self.assertEqual(published.status_code, 200, published.data)
        snapshot = self.page.publications.get()
        self.assertEqual(snapshot.document["title"], "Edited draft")
        changed = self.document()
        changed["title"] = "Secret unpublished title"
        self.assertEqual(self.client.patch(self.url, changed, format="json").status_code, 200)
        snapshot.refresh_from_db()
        self.assertEqual(snapshot.document["title"], "Edited draft")
        self.assertEqual(self.client.post(f"/cms/api/sites/{self.site.id}/publish/", {"revision": 2}).status_code, 409)

    def test_layout_theme_menu_and_props_validation(self):
        for field, value in [("menu", [{"label": "Unsafe", "href": "javascript:alert(1)"}]),
                             ("theme", "missing"), ("layout", "missing"), ("revision", 0)]:
            doc = self.document()
            doc[field] = value
            response = self.client.patch(self.url, doc, format="json")
            self.assertIn(response.status_code, [400, 404])
        for mutate in [
            lambda d: d.update(secret="ignored?"),
            lambda d: d["blocks"][0].update(kind="untrusted.widget"),
            lambda d: d["blocks"][0].update(slot="not-declared"),
            lambda d: d["blocks"][0]["props"].update(limit=10000),
            lambda d: d["blocks"][0]["props"].update(html="<script>"),
            lambda d: d["blocks"].append(deepcopy(d["blocks"][0])),
            lambda d: d.update(blocks=d["blocks"] * 7),
        ]:
            doc = self.document()
            mutate(doc)
            self.assertEqual(self.client.patch(self.url, doc, format="json").status_code, 400)
        self.assertEqual(self.document()["revision"], 1)

    def test_json_layout_tree_and_escaping(self):
        doc = self.document()
        doc["layout"] = "compact"
        doc["blocks"][0]["props"]["title"] = '<script>alert("x")</script>'
        doc["blocks"][0]["props"]["body"] = '<img src=x onerror="alert(1)">'
        self.assertEqual(self.client.patch(self.url, doc, format="json").status_code, 200)
        publication = publish_page(self.page.id, 2, self.admin)
        self.assertEqual(publication.document["sections"][0]["columns"], 2)
        self.client.force_authenticate(None)
        response = self.client.get(f"/cms/sites/{self.site.slug}/")
        self.assertContains(response, "columns-2")
        self.assertContains(response, "&lt;script&gt;")
        self.assertNotContains(response, '<img src=x onerror')
        self.assertContains(response, 'data-island="games-3"')
        self.assertContains(response, 'Popular games')

    def test_public_page_and_widget_require_current_publication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/cms/sites/{self.site.slug}/").status_code, 404)
        first = publish_page(self.page.id, 1, self.admin)
        response = self.client.get(f"/cms/sites/{self.site.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(f"/cms/sites/{self.site.slug}/", HTTP_IF_NONE_MATCH=response["ETag"]).status_code, 304)
        self.assertEqual(self.client.get(f"/cms/api/public/{self.site2.slug}/{first.id}/widgets/games-3/").status_code, 404)
        self.client.force_authenticate(self.admin)
        doc = self.document()
        doc["title"] = "Revision 2"
        self.client.patch(self.url, doc, format="json")
        publish_page(self.page.id, 2, self.admin)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/cms/api/public/{self.site.slug}/{first.id}/widgets/games-3/").status_code, 404)
        self.site.enabled = False
        self.site.save()
        self.assertEqual(self.client.get(f"/cms/sites/{self.site.slug}/").status_code, 404)

    @patch("core.crm.crm_get")
    def test_crm_widget_whitelist_filters_and_cache(self, get):
        get.return_value = [
            {"id": "one", "name": "First", "publisher_id": "pragmatic", "category_ids": ["SLOTS"], "enabled": True, "secret": "not public"},
            {"id": "two", "name": "Disabled", "publisher_id": "pragmatic", "category_ids": [], "enabled": False},
            {"id": "three", "name": "Other", "publisher_id": "other", "category_ids": ["SLOTS"], "enabled": True},
        ]
        doc = self.document()
        doc["blocks"][2]["props"].update(provider="pragmatic", category="SLOTS", limit=1)
        self.client.patch(self.url, doc, format="json")
        publication = publish_page(self.page.id, 2, self.admin)
        url = f"/cms/api/public/{self.site.slug}/{publication.id}/widgets/games-3/"
        self.client.force_authenticate(None)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], [{"id": "one", "name": "First", "provider": "pragmatic", "categories": ["SLOTS"]}])
        self.client.get(url)
        self.assertEqual(get.call_count, 1)

    @patch("core.crm.crm_get", side_effect=CRMUnavailable("CRM is offline"))
    def test_crm_failure_is_explicit(self, get):
        publication = publish_page(self.page.id, 1, self.admin)
        response = self.client.get(f"/cms/api/public/{self.site.slug}/{publication.id}/widgets/games-3/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "CRM is offline")

    def test_plugin_model_api_and_public_widget(self):
        url = f"/cms/api/plugins/announcements/{self.site.id}/"
        self.assertEqual(self.client.post(url, {"title": "Hello", "body": "Public notice", "is_public": True}).status_code, 201)
        Announcement.objects.create(site=self.site, title="Draft", body="private")
        Announcement.objects.create(site=self.site2, title="Other tenant", body="private", is_public=True)
        publication = publish_page(self.page.id, 1, self.admin)
        self.client.force_authenticate(None)
        response = self.client.get(f"/cms/api/public/{self.site.slug}/{publication.id}/widgets/announcements-notice-11/")
        self.assertEqual([a["title"] for a in response.data["items"]], ["Hello"])
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.post(url, {"title": "No", "body": "No"}).status_code, 403)
        Plugin.objects.filter(key="announcements").update(enabled=False)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.site.id}/widgets/announcements-notice-11/").status_code, 503)

    def test_publish_hooks_and_plugin_disabling(self):
        calls = []
        registry.publish_hooks.append(lambda page, doc: calls.append(page.id))
        try:
            first = publish_page(self.page.id, 1, self.admin)
            second = publish_page(self.page.id, 1, self.admin)
            self.assertEqual(first.id, second.id)
            self.assertEqual(calls, [self.page.id])
        finally:
            registry.publish_hooks.pop()
        Plugin.objects.filter(key="announcements").update(enabled=False)
        self.assertEqual(self.client.patch(self.url, self.document(), format="json").status_code, 400)

    def test_invalid_theme_or_layout_does_not_publish(self):
        Theme.objects.filter(key="dark").update(tokens={"background": "red;display:none"})
        self.assertEqual(self.client.patch(self.url, self.document(), format="json").status_code, 400)
        Theme.objects.filter(key="dark").update(tokens={"background": "#101010"})
        Layout.objects.filter(key="home").update(definition={"sections": [{"slot": "main", "columns": 99}]})
        self.assertEqual(self.client.patch(self.url, self.document(), format="json").status_code, 400)

    def test_session_csrf_and_preview_frame_rules(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        self.assertEqual(client.patch(self.url, self.document(), format="json").status_code, 403)
        response = client.get(f"/cms/preview/{self.site.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        self.assertEqual(response["X-Frame-Options"], "SAMEORIGIN")
        client.logout()
        self.assertEqual(client.get(f"/cms/preview/{self.site.id}/").status_code, 302)

    def test_health(self):
        self.assertEqual(self.client.get("/cms/health/").json(), {"status": "ok"})

    @patch("core.crm.crm_get", return_value=[])
    def test_hidden_modules_remain_in_editor_preview_only(self, get):
        doc = self.document()
        for block in doc["blocks"]:
            block["enabled"] = False
        response = self.client.patch(self.url, doc, format="json")
        self.assertEqual(response.status_code, 200)
        client = APIClient()
        client.force_login(self.admin)
        preview_url = f"/cms/preview/{self.site.id}/"
        response = client.get(preview_url)
        self.assertContains(response, 'data-cms-hidden="true"', count=15)
        self.assertContains(response, 'data-island="games-3"')
        token_url = self.client.post(f"/cms/api/sites/{self.site.id}/previews/", self.document(), format="json").data["url"]
        self.assertContains(client.get(token_url), 'data-cms-hidden="true"', count=15)
        token = token_url.split("token=")[1]
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.site.id}/widgets/games-3/?preview={token}").status_code, 200)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.site.id}/widgets/games-3/").status_code, 200)
        self.assertNotContains(client.get(token_url + "&standalone=1"), 'data-block-key=')
        self.assertNotContains(client.get(preview_url + "?standalone=1"), 'data-block-key=')
        publication = publish_page(self.page.id, 2, self.admin)
        self.assertNotContains(client.get(f"/cms/sites/{self.site.slug}/"), 'data-block-key=')
        self.assertEqual(self.client.get(f"/cms/api/public/{self.site.slug}/{publication.id}/widgets/games-3/").status_code, 404)

    def test_unsaved_preview_is_private_ephemeral_and_uses_unsaved_parameters(self):
        doc = self.document()
        doc["blocks"][2]["props"]["title"] = "Unsaved visual heading"
        doc["blocks"][2]["props"]["provider"] = "pragmatic"
        response = self.client.post(f"/cms/api/sites/{self.site.id}/previews/", doc, format="json")
        self.assertEqual(response.status_code, 200)
        url = response.data["url"]
        self.assertEqual(self.document()["blocks"][2]["props"]["title"], "Popular games")
        client = APIClient()
        client.force_login(self.admin)
        self.assertContains(client.get(url), "Unsaved visual heading")
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.get(f"/cms/api/sites/{self.site.id}/widgets/games-3/?preview={url.split('token=')[1]}").status_code, 404)
        client.logout()
        self.assertEqual(client.get(url).status_code, 302)
        client.force_login(self.admin)
        cache.clear()
        self.assertEqual(client.get(url).status_code, 404)
