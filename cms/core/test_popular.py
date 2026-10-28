from copy import deepcopy
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .crm import CRMUnavailable
from .models import Page, PopularRanking
from .modules import PopularProps
from .popular import popular_games
from .services import document_for, publish_page
from .starter import import_site


class PopularTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_superuser("popular-test", password="test-only-popular-password")
        self.site = import_site({"id": "CS-0000000000000001", "name": "Popular test", "enabled": True,
                                 "theme": "dark", "url": "https://popular.example"})
        self.site2 = import_site({"id": "CS-0000000000000002", "name": "Other", "enabled": True,
                                  "theme": "dark", "url": "https://other.example"})
        self.page = Page.objects.select_related("layout", "site__theme").get(site=self.site)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.force_login(self.user)
        self.rank = {"items": [{"gameId": f"g{i}"} for i in range(1, 31)], "metric": "bet_volume",
                     "country": "PL", "countryName": "Poland", "period": {"minutes": 60, "live": True},
                     "updatedAt": "2026-10-27T10:00:00Z", "personalized": False, "demo": True}
        self.context = {"country": "PL", "player": ""}
        self.mock = patch("core.crm.crm_get", side_effect=self.crm)
        self.get = self.mock.start()
        self.addCleanup(self.mock.stop)

    def crm(self, path, **kwargs):
        if path == "games":
            return [{"id": f"g{i}", "name": f"Game {i}", "publisher_id": "p1", "enabled": i != 30,
                     "image": "/game.svg", "badges": ["NEW", "HOT", "JACKPOT"]} for i in range(1, 31)]
        if path == "games/publishers":
            return [{"id": "p1", "name": "Provider One"}]
        if path == "games/demo-favourites":
            return []
        if path == "games/ranking":
            return deepcopy(self.rank)
        raise AssertionError(path)

    def props(self, **values):
        return {"title": "Popular games", **values}

    def test_defaults_validation_and_legacy_settings(self):
        valid = PopularProps(data=self.props(limit=8, provider="", category=""))
        self.assertTrue(valid.is_valid(), valid.errors)
        self.assertEqual(valid.validated_data["homeLimit"], 10)
        double = PopularProps(data=self.props(layout="double"))
        self.assertTrue(double.is_valid(), double.errors)
        self.assertEqual(double.validated_data["homeLimit"], 20)
        for values in ({"mode": "bad"}, {"homeLimit": 0}, {"pageLimit": 201}, {"homeLimit": 21, "pageLimit": 20},
                       {"games": ["g1", "g1"]}, {"rankingMinutes": 0}, {"pinned": [{"gameId": "g1", "position": 0}]},
                       {"pinned": [{"gameId": "g1", "position": 2}, {"gameId": "g2", "position": 2}]},
                       {"pinned": [{"gameId": "g1", "position": 2, "extra": True}]}):
            serializer = PopularProps(data=self.props(**values))
            self.assertFalse(serializer.is_valid(), values)

    def test_auto_manual_hybrid_ai_and_limits(self):
        auto = popular_games(self.site, self.props(pageLimit=20), self.context)
        self.assertEqual(len(auto["items"]), 20)
        self.assertEqual(auto["items"][0]["provider"], "Provider One")
        self.assertEqual(len(popular_games(self.site, self.props(pageLimit=20), self.context, browse=True)["items"]), 29)
        manual = popular_games(self.site, self.props(mode="manual", games=["g4", "missing", "g2", "g30"]), self.context)
        self.assertEqual([g["id"] for g in manual["items"]], ["g4", "g2"])
        hybrid = popular_games(self.site, self.props(mode="hybrid", pageLimit=10, pinned=[
            {"gameId": "g9", "position": 1}, {"gameId": "g1", "position": 3}]), self.context)
        self.assertEqual([g["id"] for g in hybrid["items"][:5]], ["g9", "g2", "g1", "g3", "g4"])
        self.assertEqual(len(hybrid["items"]), 10)
        self.assertEqual(len({g["id"] for g in hybrid["items"]}), 10)
        popular_games(self.site, self.props(mode="ai"), {"country": "BR", "player": "demo-test"})
        self.get.assert_any_call("games/ranking", casino_id=self.site.crm_id,
            params={"country": "BR", "player": "demo-test", "mode": "personal", "minutes": 60}, full_response=True)

    def test_durable_outage_copy_is_scoped_and_empty_is_not_failure(self):
        original = popular_games(self.site, self.props(), self.context)
        self.assertEqual(PopularRanking.objects.filter(site=self.site).count(), 2)
        cache.clear()
        self.get.side_effect = CRMUnavailable("Ranking offline")
        saved = popular_games(self.site, self.props(), self.context)
        self.assertEqual(saved["items"], original["items"])
        self.assertTrue(saved["stale"])
        with self.assertRaises(CRMUnavailable):
            popular_games(self.site2, self.props(), self.context)
        with self.assertRaises(CRMUnavailable):
            popular_games(self.site, self.props(mode="ai"), {"country": "PL", "player": "demo-other"})
        old_owner = self.site.crm_id
        self.site.crm_id = "CS-relinked"
        with self.assertRaises(CRMUnavailable):
            popular_games(self.site, self.props(), self.context)
        self.site.crm_id = old_owner
        self.get.side_effect = self.crm
        cache.clear()
        self.rank["items"] = []
        self.assertEqual(popular_games(self.site, self.props(), self.context)["items"], [])

    def test_invalid_ranking_is_error_not_empty_success(self):
        for field, value in (("metric", "unexpected"), ("updatedAt", "bad"), ("items", [{}]), ("period", {"minutes": True})):
            rank = deepcopy(self.rank)
            self.rank[field] = value
            with self.assertRaises(CRMUnavailable):
                popular_games(self.site, self.props(), self.context)
            self.rank = rank
            cache.clear()

    def test_locale_overrides_multiple_modules_full_list_and_hidden_boundary(self):
        doc = document_for(self.page)
        block = next(b for b in doc["blocks"] if b["kind"] == "games")
        block["props"].update(mode="manual", games=["g1", "g2"])
        block["translations"] = {"ru": {"title": "RU games", "games": ["g4"], "layout": "double", "homeLimit": 20}}
        second = deepcopy(block)
        second["key"] = "games-another"
        second["props"]["title"] = "Second list"
        second["translations"] = {}
        doc["blocks"].append(second)
        base = f"/cms/api/sites/{self.site.pk}/"
        result = self.client.patch(base + "draft/", doc, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.client.get(base + "widgets/games-3/?lang=ru").data["items"][0]["id"], "g4")
        self.assertEqual(self.client.get(base + "widgets/games-3/?lang=es").data["items"][0]["id"], "g1")
        publication = publish_page(self.page.pk, result.data["document"]["revision"], self.user)
        url = f"/cms/sites/{self.site.slug}/"
        home = self.client.get(url).content.decode()
        self.assertLess(home.index('id="games-3"'), home.index('id="games-another"'))
        full = self.client.get(url + "?popular=games-another")
        self.assertContains(full, "Second list")
        self.assertNotContains(full, 'id="games-3"')
        self.assertContains(full, "Back to home")
        self.assertEqual(self.client.get(url + "?popular=missing").status_code, 404)
        public = f"/cms/api/public/{self.site.slug}/{publication.pk}/widgets/games-3/"
        self.assertEqual(self.client.get(public).data["items"][0]["id"], "g1")
        self.assertIn("private", self.client.get(public)["Cache-Control"])

    def test_favourites_require_csrf_and_demo_player_and_current_publication(self):
        publication = publish_page(self.page.pk, 1, self.user)
        url = f"/cms/api/public/{self.site.slug}/{publication.pk}/widgets/games-3/favourites/"
        anonymous = APIClient(enforce_csrf_checks=True)
        self.assertEqual(anonymous.post(url + "?demo_player=1", {"gameId": "g1", "favourite": True}, format="json").status_code, 403)
        anonymous.get(f"/cms/sites/{self.site.slug}/?demo_player=1")
        csrf = anonymous.cookies[settings.CSRF_COOKIE_NAME].value
        self.assertEqual(anonymous.post(url, {"gameId": "g1", "favourite": True}, format="json", HTTP_X_CSRFTOKEN=csrf).status_code, 403)
        with patch("core.views.crm_get", return_value={"items": [{"gameId": "g1"}], "total": 1}) as write:
            response = anonymous.post(url + "?demo_player=1", {"gameId": "g1", "favourite": True}, format="json", HTTP_X_CSRFTOKEN=csrf)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(write.call_args.kwargs["params"]["player"].startswith("demo-"))
            self.assertEqual(write.call_args.kwargs["casino_id"], self.site.crm_id)
