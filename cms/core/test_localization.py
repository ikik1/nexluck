from copy import deepcopy
from dataclasses import replace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import translation
from rest_framework.test import APIClient

from core.models import Page
from core.registry import registry
from core.services import document_for
from core.starter import import_site
from core.i18n import LOCALES, catalog


class LocalizationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_superuser("locale-admin", password="test-password")
        self.site = import_site({"id": "CS-LOCALE", "name": "Casino unchanged", "enabled": True,
                                 "theme": "dark", "url": "https://locale.example"})
        self.page = Page.objects.get(site=self.site, slug="home")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.force_login(self.user)
        self.base = f"/cms/api/sites/{self.site.pk}/"
        self.document = document_for(Page.objects.select_related("layout", "site__theme").get(pk=self.page.pk))
        self.block = next(b for b in self.document["blocks"] if b["kind"] == "games")
        self.block["props"]["title"] = "English heading"
        self.block["props"]["body"] = "English fallback"
        self.block["translations"] = {"ru": {"title": "Русский заголовок", "limit": 2}}

    def test_cms_catalogs_cover_every_supported_language_and_message(self):
        messages = catalog()
        self.assertEqual(set(messages), set(LOCALES))
        source_keys = set(messages["en"])
        for locale in LOCALES:
            with self.subTest(locale=locale):
                self.assertEqual(set(messages[locale]), source_keys)
                self.assertTrue(all(isinstance(value, str) and value for value in messages[locale].values()))
        self.assertIn("pt-PT", LOCALES)
        self.assertIn("pt-BR", LOCALES)
        self.assertIn("es", LOCALES)

    def test_wallet_language_preference_and_explicit_override(self):
        self.save()
        url = self.publish()
        self.client.cookies["nexluck_website_language"] = "ru"
        self.assertContains(self.client.get(url), 'lang="ru"')
        self.assertContains(self.client.get(url + "?lang=es"), 'lang="es"')
        self.client.cookies["nexluck_website_language"] = "invalid"
        self.assertContains(self.client.get(url), 'lang="en"')

    def save(self):
        response = self.client.patch(self.base + "draft/", self.document, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.document = response.json()["document"]
        return response

    def publish(self):
        response = self.client.post(self.base + "publish/", {"revision": self.document["revision"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["url"]

    def test_save_reload_preview_publish_and_widget_language(self):
        self.save()
        loaded = self.client.get(self.base + "draft/").json()["document"]
        block = next(b for b in loaded["blocks"] if b["key"] == self.block["key"])
        self.assertEqual(block["translations"]["ru"]["title"], "Русский заголовок")
        self.assertEqual(block["props"]["title"], "English heading")
        preview = self.client.post(self.base + "previews/?lang=ru", loaded, format="json")
        self.assertEqual(preview.status_code, 200)
        self.assertIn("lang=ru", preview.json()["url"])
        html = self.client.get(preview.json()["url"])
        self.assertContains(html, 'lang="ru"')
        self.assertContains(html, "Русский заголовок")
        self.assertContains(html, "English fallback")
        self.assertContains(html, "lang=ru")
        url = self.publish()
        ru = self.client.get(url + "?lang=ru")
        en = self.client.get(url + "?lang=en")
        self.assertContains(ru, "Русский заголовок")
        self.assertContains(ru, "English fallback")
        self.assertNotContains(en, "<h2>Русский заголовок</h2>")
        self.assertContains(en, "English heading")
        self.assertContains(ru, "Casino unchanged")
        self.assertContains(ru, catalog()["ru"]["View all →"])
        self.assertContains(ru, "Загрузка каталога...")
        self.page.refresh_from_db()
        widget = f"/cms/api/public/{self.site.slug}/{self.page.published_id}/widgets/{self.block['key']}/"
        module = registry.modules["games"]
        captured = []

        def data(site, props):
            captured.append(deepcopy(props))
            return {"items": [{"id": "original-id", "name": "Never translated"}]}

        with patch.dict(registry.modules, {"games": replace(module, data=data)}):
            public_ru = self.client.get(widget + "?lang=ru")
            public_en = self.client.get(widget + "?lang=en")
            token = preview.json()["url"].split("token=")[1].split("&")[0]
            private = self.client.get(self.base + f"widgets/{self.block['key']}/?preview={token}&lang=ru")
        self.assertEqual(captured[0]["title"], "Русский заголовок")
        self.assertEqual(captured[0]["limit"], 2)
        self.assertEqual(captured[1]["title"], "English heading")
        self.assertEqual(captured[2]["title"], "Русский заголовок")
        self.assertEqual(private.status_code, 200)
        self.assertEqual(public_ru.json()["items"][0]["name"], "Never translated")
        self.assertNotEqual(public_ru["ETag"], public_en["ETag"])

    def test_locale_isolation_and_etags(self):
        self.save()
        url = self.publish()
        self.page.refresh_from_db()
        etags = {}
        for locale in LOCALES:
            with self.subTest(locale=locale):
                response = self.client.get(url + f"?lang={locale}")
                etags[locale] = response["ETag"]
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Content-Language"], locale)
                self.assertEqual(self.client.get(
                    url + f"?lang={locale}", HTTP_IF_NONE_MATCH=response["ETag"]
                ).status_code, 304)
        self.assertEqual(len(set(etags.values())), len(LOCALES))
        for locale in etags:
            other = next(tag for other_locale, tag in etags.items() if other_locale != locale)
            self.assertEqual(self.client.get(url + f"?lang={locale}", HTTP_IF_NONE_MATCH=other).status_code, 200)

    def test_invalid_locale_and_localized_parameters_rejected(self):
        for overrides in ({"de": {}}, {"en": {}}, {"ru": "bad"}, {"ru": {"limit": 0}}, {"ru": {"unknown": "bad"}}, []):
            with self.subTest(overrides=overrides):
                self.block["translations"] = overrides
                response = self.client.patch(self.base + "draft/", self.document, format="json")
                self.assertEqual(response.status_code, 400, response.content)
        self.block["translations"] = {"ru": {"title": "Valid"}}
        self.save()
        url = self.publish()
        self.assertEqual(self.client.get(url + "?lang=de").status_code, 400)
        self.assertEqual(self.client.post(self.base + "previews/?lang=de", self.document, format="json").status_code, 400)
        self.assertEqual(self.client.get(self.base + f"widgets/{self.block['key']}/?lang=de").status_code, 400)

    def test_backward_compatible_documents_and_fallback(self):
        for block in self.document["blocks"]:
            block.pop("translations", None)
        self.save()
        url = self.publish()
        self.assertContains(self.client.get(url + "?lang=ru"), "English heading")
        self.assertEqual(self.client.get(self.base + "draft/").json()["document"]["blocks"][0]["translations"], {})

    def test_all_content_languages_are_independent_and_django_compatible(self):
        translations = {
            "ru": {"title": "Русский заголовок"},
            "pt-PT": {"title": "Título português"},
            "pt-BR": {"title": "Título brasileiro"},
            "es": {"title": "Título español"},
        }
        self.block["translations"] = translations
        self.save()
        url = self.publish()
        self.page.refresh_from_db()
        expected = {
            "en": ("English heading", "en"),
            "ru": ("Русский заголовок", "ru"),
            "pt-PT": ("Título português", "pt"),
            "pt-BR": ("Título brasileiro", "pt-br"),
            "es": ("Título español", "es"),
        }
        widget_etags = {}
        for locale, (title, django_locale) in expected.items():
            with self.subTest(locale=locale):
                self.client.cookies["nexluck_language"] = locale
                editor = self.client.get("/cms/")
                self.assertContains(editor, f'<html lang="{locale}">', html=False)
                response = self.client.get(url + f"?lang={locale}")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Content-Language"], locale)
                self.assertContains(response, f'<html lang="{locale}">', html=False)
                self.assertContains(response, title)
                self.assertContains(response, catalog()[locale]["View all →"])
                saved = self.client.get(self.base + "draft/").json()["document"]
                saved_block = next(b for b in saved["blocks"] if b["key"] == self.block["key"])
                self.assertEqual(saved_block["translations"], translations)
                captured = []
                module = registry.modules["games"]
                with patch.dict(registry.modules, {"games": replace(
                    module, data=lambda site, props: captured.append(translation.get_language()) or {"items": []}
                )}):
                    widget = self.client.get(
                        f"/cms/api/public/{self.site.slug}/{self.page.published_id}/widgets/"
                        f"{self.block['key']}/?lang={locale}"
                    )
                self.assertEqual(captured, [django_locale])
                widget_etags[locale] = widget["ETag"]
        self.assertEqual(len(set(widget_etags.values())), len(LOCALES))

    def test_fallback_tracks_english_and_seo_translation_is_sanitized(self):
        self.block["translations"] = {"ru": {"title": "Русский заголовок"}}
        seo = next(b for b in self.document["blocks"] if b["kind"] == "seo")
        seo["translations"] = {"ru": {"html": '<h2>Текст SEO</h2><script>alert(1)</script>'}}
        self.save()
        block = next(b for b in self.document["blocks"] if b["key"] == self.block["key"])
        block["props"]["body"] = "Updated English fallback"
        self.save()
        seo = next(b for b in self.document["blocks"] if b["kind"] == "seo")
        self.assertNotIn("<script>", seo["translations"]["ru"]["html"])
        page = self.client.get(self.publish() + "?lang=ru")
        self.assertContains(page, "Updated English fallback")
        self.assertContains(page, "<h2>Текст SEO</h2>")
        self.assertNotContains(page, "<script>alert(1)</script>")

    def test_widget_errors_use_website_language_not_ui_cookie(self):
        from core.crm import CRMUnavailable
        self.save()
        self.publish()
        self.page.refresh_from_db()
        widget = f"/cms/api/public/{self.site.slug}/{self.page.published_id}/widgets/{self.block['key']}/"
        module = registry.modules["games"]

        def unavailable(*args):
            raise CRMUnavailable("CRM catalog unavailable. Please retry.")

        with patch.dict(registry.modules, {"games": replace(module, data=unavailable)}):
            response = self.client.get(widget + "?lang=ru")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Каталог CRM недоступен. Повторите попытку.")
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_ui_cookie_and_website_locale_are_independent(self):
        self.client.cookies["nexluck_language"] = "ru"
        login = self.client.get("/cms/login/")
        self.assertContains(login, 'lang="ru"')
        self.assertContains(login, "Войти в CMS")
        self.assertContains(login, "/cms/i18n/runtime.js")
        self.assertContains(login, "mountSelector")
        self.assertContains(self.client.get("/cms/admin/"), "Администрирование NexLuck CMS")
        asset = self.client.get("/cms/i18n/runtime.js")
        self.assertEqual(asset.status_code, 200)
        self.assertEqual(asset["Content-Type"], "application/javascript")
        asset.close()
        schema = self.client.get("/cms/api/modules/").json()["items"]
        self.assertEqual(next(m for m in schema if m["key"] == "games")["properties"]["title"]["title"], "Заголовок")
        self.block["translations"] = {"ru": {"limit": 0}}
        invalid = self.client.patch(self.base + "draft/", self.document, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertNotIn("Ensure this value", str(invalid.json()))
        self.block["translations"] = {}
        self.save()
        url = self.publish()
        self.assertContains(self.client.get(url), 'lang="en"')
