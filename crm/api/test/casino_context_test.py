"""HTTP isolation, atomic clone and restart regressions against a private store."""
import json
import base64
import os
from pathlib import Path
import socket
import shutil
import subprocess
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[3]


class CasinoContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="nexluck-context-")
        cls.log = tempfile.TemporaryFile(mode="w+")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            cls.port = listener.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}/crm/ui-api/v1/"
        cls.env = {**os.environ, "CRM_CUSTOMER_DATA_DIR": cls.directory.name, "CRM_UI_MODE": "demo"}
        cls.start()
        _, registry = cls.request("casinos")
        cls.a, cls.b = [site["id"] for site in registry["items"][:2]]

    @classmethod
    def start(cls):
        cls.process = subprocess.Popen(
            ["ruby", "crm/api/server.rb", str(cls.port)], cwd=ROOT, env=cls.env,
            stdout=cls.log, stderr=cls.log,
        )
        for _ in range(100):
            if cls.process.poll() is not None:
                cls.log.seek(0)
                raise AssertionError(cls.log.read())
            try:
                if cls.request("casinos")[0] == 200:
                    return
            except URLError:
                pass
            time.sleep(0.05)
        raise AssertionError("CRM test server did not become ready")

    @classmethod
    def stop(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)

    @classmethod
    def tearDownClass(cls):
        cls.stop()
        cls.log.close()
        cls.directory.cleanup()

    @classmethod
    def request(cls, path, casino=None, method="GET", body=None, key=None, auth=None, origin=None):
        headers = {"Content-Type": "application/json"}
        if casino:
            headers["X-Casino-Id"] = casino
        if key:
            headers["Idempotency-Key"] = key
        if auth:
            headers["Authorization"] = "Basic " + base64.b64encode(auth.encode()).decode()
        if origin:
            headers["Origin"] = origin
        request = Request(cls.base + path, headers=headers, method=method,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def create(self, source=None, groups=None, key=None):
        body = {"name": "Context regression", "url": "https://context.example", "theme": "modern"}
        if source:
            status, preview = self.request("casinos/clone-preview", method="POST",
                                           body={"source_id": source, "groups": groups or []})
            self.assertEqual(status, 200, preview)
            body.update(source_id=source, groups=groups or [], source_revision=preview["source_revision"])
        return self.request("casinos", method="POST", body=body, key=key or os.urandom(12).hex())

    def test_missing_invalid_and_foreign_context(self):
        for casino in (None, "bad"):
            self.assertEqual(self.request("customers", casino)[0], 400)
            self.assertEqual(self.request("bonuses", casino, "POST", {})[0], 400)
        self.assertEqual(self.request("customers", "CS-ffffffffffffffff")[0], 403)
        self.assertEqual(self.request("customers/CU-1001", self.b)[0], 404)
        self.assertEqual(self.request("bonuses/BN-1001/promo-banner", self.b)[0], 404)
        self.assertEqual(self.request("customers/CU-1001", self.a, "PATCH", {"casino_id": self.b})[0], 422)

    def test_home_dashboard_for_every_casino_is_stable_and_non_operational(self):
        sections = {"analytics", "casinos", "customers", "games", "bonuses", "loyalty", "finance", "compliance", "audit"}
        casinos = self.request("casinos")[1]["items"]
        snapshots = {}
        for casino in casinos:
            status, dashboard = self.request("dashboard", casino["id"])
            self.assertEqual(status, 200, dashboard)
            self.assertEqual(dashboard["casino_id"], casino["id"])
            self.assertEqual(dashboard["source"], "synthetic_demo")
            self.assertEqual(set(dashboard["sections"]), sections)
            self.assertEqual(dashboard["sections"]["casinos"]["value"], str(len(casinos)))
            for block in dashboard["sections"].values():
                self.assertTrue(block["value"])
                self.assertEqual(len(block["metrics"]), 4)
                self.assertTrue(all(metric["value"] and metric["label"] for metric in block["metrics"]))
            snapshots[casino["id"]] = dashboard
        self.assertNotEqual(snapshots[self.a]["sections"]["customers"], snapshots[self.b]["sections"]["customers"])
        self.assertEqual(self.request("dashboard")[0], 400)
        self.assertEqual(self.request("dashboard", "CS-ffffffffffffffff")[0], 403)
        self.assertEqual(self.request("dashboard", self.a, "POST", {})[0], 405)
        self.stop()
        self.start()
        for casino_id, snapshot in snapshots.items():
            self.assertEqual(self.request("dashboard", casino_id)[1], snapshot)
        status, created = self.create()
        self.assertEqual(status, 201)
        self.assertEqual(self.request("dashboard", created["id"])[1]["casino_id"], created["id"])
        self.assertEqual(self.request("customers", created["id"])[1]["items"], [])
        self.assertEqual(self.request("finance", created["id"])[1]["wallet_transactions"], [])

    def test_migration_and_restart_are_idempotent(self):
        self.assertEqual(self.request("customers", self.a)[1]["total"], 12)
        self.assertEqual(self.request("customers", self.b)[1]["total"], 0)
        self.assertEqual(self.request("bonuses", self.b)[1]["total"], 0)
        finance_a = self.request("finance", self.a)[1]
        finance_b = self.request("finance", self.b)[1]
        self.assertGreater(len(finance_a["wallet_transactions"]), 0)
        self.assertEqual(finance_b["wallet_transactions"], [])
        for connection in finance_b["connections"]:
            self.assertEqual(connection["settings"], {})
            self.assertFalse(connection["enabled"])
            self.assertTrue(connection["configuration_required"])
            self.assertEqual(connection["casino_id"], self.b)
        path = Path(self.directory.name) / "casino_context.json"
        before = path.read_bytes()
        self.stop()
        self.start()
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.request("finance", self.a)[1], finance_a)
        self.assertEqual(self.request("finance", self.b)[1], finance_b)
        self.assertTrue((Path(self.directory.name) / "before-casino-context" / "profiles.json").is_file())
        self.stop()
        with tempfile.TemporaryDirectory(prefix="nexluck-context-restore-") as backup:
            shutil.copytree(self.directory.name, backup, dirs_exist_ok=True)
            self.start()
            self.request("customers/CU-1001", self.a, "PATCH", {"info": "After backup"})
            self.stop()
            shutil.copytree(backup, self.directory.name, dirs_exist_ok=True)
            self.start()
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(self.request("finance", self.a)[1], finance_a)

    def test_empty_creation_has_no_seed_or_implicit_context_switch(self):
        status, target = self.create()
        self.assertEqual(status, 201, target)
        casino = target["id"]
        for resource in ("customers", "bonuses", "segments", "games", "games/categories", "games/publishers"):
            self.assertEqual(self.request(resource, casino)[1]["items"], [], resource)
        self.assertEqual(self.request("finance", casino)[1]["connections"], [])
        self.assertEqual(self.request("casinos", self.a)[1], self.request("casinos", casino)[1])

    def test_selective_clone_graph_is_independent_and_owner_local(self):
        status, target = self.create(self.a, ["games"])
        self.assertEqual(status, 201, target)
        casino = target["id"]
        self.assertIn("catalogs", target["clone"]["dependency_groups"])
        self.assertIn("segments", target["clone"]["dependency_groups"])
        source_games = self.request("games", self.a)[1]["items"]
        games = self.request("games", casino)[1]["items"]
        categories = self.request("games/categories", casino)[1]["items"]
        providers = self.request("games/publishers", casino)[1]["items"]
        game_ids = {game["id"] for game in games}
        provider_ids = {provider["id"] for provider in providers}
        self.assertTrue(game_ids.isdisjoint({game["id"] for game in source_games}))
        self.assertEqual([game["external_id"] for game in source_games], [game["external_id"] for game in games])
        for game in games:
            self.assertEqual(game["casino_id"], casino)
            self.assertIn(game["publisher_id"], provider_ids)
            self.assertEqual(game["created_at"], game["updated_at"])
        for category in categories:
            self.assertLessEqual(set(category["game_ids"]), game_ids)
        source_category = self.request("games/categories", self.a)[1]["items"][0]["id"]
        self.assertEqual(self.request("games/" + games[0]["id"], casino, "PATCH", {"category_ids": [source_category]})[0], 422)
        status, saved = self.request("games/" + games[0]["id"], casino, "PATCH", {"name": "Independent target"})
        self.assertEqual(status, 200, saved)
        self.assertNotEqual(self.request("games/" + source_games[0]["id"], self.a)[1]["name"], saved["name"])
        self.assertEqual(self.request("games/" + games[0]["id"], self.a)[0], 404)
        self.assertEqual(self.request("finance", casino)[1]["connections"], [])

    def test_segment_only_has_no_unrelated_history(self):
        status, segment = self.request("segments", self.a, "POST", {
            "name": "Simple isolated clone",
            "rules": {"kind": "rule", "field": "funnel_status", "operator": "IS", "value": ["VIP"], "not": False},
        })
        self.assertEqual(status, 201, segment)
        status, target = self.create(self.a, ["segments"])
        self.assertEqual(status, 201, target)
        self.assertEqual(self.request("customers", target["id"])[1]["items"], [])
        self.assertEqual(self.request("finance", target["id"])[1]["wallets"], [])
        self.assertEqual(self.request("bonuses", target["id"])[1]["items"], [])
        self.assertNotIn(segment["id"], {row["id"] for row in self.request("segments", target["id"])[1]["items"]})

    def test_stale_preview_and_idempotency(self):
        _, preview = self.request("casinos/clone-preview", method="POST", body={"source_id": self.a, "groups": ["games"]})
        self.request("customers/CU-1001", self.a, "PATCH", {"info": "Revision regression"})
        body = {"name": "Stale copy", "url": "https://stale.example", "theme": "classic",
                "source_id": self.a, "source_revision": preview["source_revision"], "groups": ["games"]}
        before = self.request("casinos")[1]["total"]
        status, error = self.request("casinos", method="POST", body=body, key="stale-preview-test")
        self.assertEqual(status, 409, error)
        self.assertEqual(self.request("casinos")[1]["total"], before)
        body = {"name": "Retry", "url": "https://retry.example", "theme": "dark"}
        first = self.request("casinos", method="POST", body=body, key="retry-once-test")
        second = self.request("casinos", method="POST", body=body, key="retry-once-test")
        self.assertEqual(first, second)
        self.assertEqual(first[0], 201)
        self.assertEqual(self.request("casinos")[1]["total"], before + 1)
        body["name"] = "Changed payload"
        self.assertEqual(self.request("casinos", method="POST", body=body, key="retry-once-test")[0], 409)

    def test_reporting_is_unscoped_and_owner_qualified(self):
        first = self.request("reporting/segments", self.a)
        second = self.request("reporting/segments", self.b)
        self.assertEqual(first, second)
        self.assertEqual(first[0], 200)
        self.assertTrue(all(row["id"] == row["casino_id"] + ":" + row["object_id"] for row in first[1]["items"]))
        self.assertGreater(len({row["casino_id"] for row in first[1]["items"]}), 1)
        self.assertEqual(self.request("reporting/segments", self.a, "POST", {})[0], 405)

    def test_nested_bonus_resources_and_rates_keep_ownership(self):
        status, banner = self.request("bonuses/BN-1001/promo-banner", self.a)
        self.assertEqual(status, 200)
        self.assertEqual(banner.pop("casino_id"), self.a)
        banner["title"] = "Owner-local promotion"
        status, saved = self.request("bonuses/BN-1001/promo-banner", self.a, "PUT", banner)
        self.assertEqual(status, 200, saved)
        self.assertEqual(saved["casino_id"], self.a)
        self.assertEqual(self.request("bonuses/BN-1001/promo-banner", self.b)[0], 404)
        self.assertEqual(self.request("bonuses/BN-1001/changelog", self.a)[1]["items"][0]["casino_id"], self.a)
        original = self.request("exchange-rates", self.a)[1]
        status, rates = self.request("exchange-rates", self.b, "PATCH", {"rates": {"USD": 1.234}})
        self.assertEqual(status, 200, rates)
        self.assertEqual(rates["casino_id"], self.b)
        self.assertEqual(self.request("exchange-rates", self.a)[1], original)

    def test_payment_clone_scrubs_secrets_and_executable_routing(self):
        status, target = self.create(self.a, ["payment_connections"])
        self.assertEqual(status, 201, target)
        casino = target["id"]
        finance = self.request("finance", casino)[1]
        for connection in finance["connections"]:
            self.assertFalse(connection["enabled"])
            self.assertTrue(connection["configuration_required"])
            self.assertEqual(connection["settings"], {})
            self.assertEqual(connection["casino_id"], casino)
        names = {connection["name"] for connection in finance["connections"]}
        for cascade in finance["cascades"]:
            self.assertFalse(cascade["enabled"])
            self.assertTrue(cascade["configuration_required"])
            self.assertTrue(all(step["psp"] in names for step in cascade["steps"]))
        for key in ("wallets", "wallet_transactions", "transactions", "players"):
            self.assertEqual(finance[key], [])

    def test_segment_only_clone_without_catalog_dependencies(self):
        _, empty = self.create()
        _, segment = self.request("segments", empty["id"], "POST", {
            "name": "VIP status only",
            "rules": {"kind": "rule", "field": "funnel_status", "operator": "IS", "value": ["VIP"], "not": False},
        })
        status, target = self.create(empty["id"], ["segments"])
        self.assertEqual(status, 201, target)
        self.assertEqual(target["clone"]["dependency_groups"], [])
        self.assertEqual(target["clone"]["counts"]["segments"], 1)
        self.assertEqual(self.request("games", target["id"])[1]["items"], [])
        self.assertEqual(self.request("catalogs", target["id"])[1]["currencies"], [])
        self.assertNotEqual(self.request("segments", target["id"])[1]["items"][0]["id"], segment["id"])

    def test_z_authentication_permissions_and_cross_origin_mutations(self):
        self.stop()
        self.env.update(CRM_ALLOWED_CASINOS=self.a, CRM_REPORTING_CASINOS=self.b)
        self.start()
        try:
            self.assertEqual(self.request("casinos")[1]["total"], 1)
            self.assertEqual(self.request("customers", self.b)[0], 403)
            self.assertEqual(self.request("context-events", method="POST", body={"from": self.b, "to": self.a})[0], 200)
            self.assertEqual(self.request("casinos/clone-preview", method="POST", body={"source_id": self.b, "groups": []})[0], 403)
            self.assertEqual({row["casino_id"] for row in self.request("reporting/games")[1]["items"]}, {self.b})
            self.stop()
            self.env.update(CRM_UI_MODE="authenticated", CRM_OPERATOR_USERNAME="context-operator",
                            CRM_OPERATOR_PASSWORD="test-only-password-123")
            self.start_authenticated()
            self.assertEqual(self.request("casinos")[0], 401)
            self.assertEqual(self.request("casinos", auth="context-operator:wrong")[0], 401)
            auth = "context-operator:test-only-password-123"
            self.assertEqual(self.request("casinos", auth=auth)[0], 200)
            self.assertEqual(self.request("customers", self.b, auth=auth)[0], 403)
            self.assertEqual(self.request("customers/CU-1001", self.a, "PATCH", {"info": "CSRF attempt"}, auth=auth, origin="https://not-crm.example")[0], 403)
        finally:
            self.stop()
            for key in ("CRM_ALLOWED_CASINOS", "CRM_REPORTING_CASINOS", "CRM_OPERATOR_USERNAME", "CRM_OPERATOR_PASSWORD"):
                self.env.pop(key, None)
            self.env["CRM_UI_MODE"] = "demo"
            self.start()

    @classmethod
    def start_authenticated(cls):
        cls.process = subprocess.Popen(["ruby", "crm/api/server.rb", str(cls.port)], cwd=ROOT, env=cls.env,
                                       stdout=cls.log, stderr=cls.log)
        for _ in range(100):
            try:
                if cls.request("casinos")[0] == 401:
                    return
            except URLError:
                pass
            time.sleep(0.05)
        raise AssertionError("Authenticated CRM did not become ready")


if __name__ == "__main__":
    unittest.main()
