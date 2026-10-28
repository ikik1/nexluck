"""Casino-scoped loyalty CRUD, upgrades, validation and restart persistence."""
import json
import base64
import secrets
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from casino_context_test import CasinoContextTests as Server


class LoyaltyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Server.setUpClass()
        Server.stop()
        Server.env.update(CRM_CLIENT_ID="loyalty-test", CRM_CLIENT_SECRET=secrets.token_hex(24))
        Server.start()

    @classmethod
    def tearDownClass(cls):
        Server.tearDownClass()

    def test_oauth_scope_permissions(self):
        base = Server.base.replace("/ui-api/", "/api/")
        def secure(path, method="GET", body=None, token=None):
            headers = {"Content-Type": "application/json", "X-Casino-Id": Server.a}
            if token:
                headers["Authorization"] = "Bearer " + token
            req = Request(base + path, method=method, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
            try:
                response = urlopen(req)
            except HTTPError as error:
                response = error
            with response:
                return response.status, json.load(response)

        def token(scope):
            credentials = base64.b64encode(("loyalty-test:" + Server.env["CRM_CLIENT_SECRET"]).encode()).decode()
            req = Request(base + "oauth/token", data=urlencode({"grant_type": "client_credentials", "scope": scope}).encode(),
                          headers={"Authorization": "Basic " + credentials, "Content-Type": "application/x-www-form-urlencoded"})
            with urlopen(req) as response:
                return json.load(response)["access_token"]

        self.assertEqual(secure("loyalty")[0], 401)
        read_token = token("loyalty:read")
        write_token = token("loyalty:write")
        status, _ = secure("loyalty", token=read_token)
        self.assertEqual(status, 200)
        status, tier = secure("loyalty/tiers", "POST", {"name": "Scope test", "minimum_points": 99000,
            "game_weight": 1, "eur_per_point": 10, "segment_ids": [], "bonus_ids": [], "cashback": 15, "rakeback": 10}, write_token)
        self.assertEqual(status, 201)
        self.assertEqual(secure("loyalty/tiers/" + tier["id"], "PATCH", {"cashback": 17}, read_token)[0], 403)
        self.assertEqual(secure("loyalty", token=write_token)[0], 403)
        self.assertEqual(secure("loyalty/tiers/" + tier["id"], "PATCH", {"cashback": 17}, write_token)[0], 200)
        self.assertEqual(secure("customers/CU-1001", "PATCH", {"loyalty_points": 1000}, write_token)[0], 403)
        self.assertEqual(secure("loyalty/tiers/" + tier["id"], "DELETE", token=write_token)[0], 200)

    def test_loyalty_workflow(self):
        def request(path, method="GET", body=None, casino=None, expected=200):
            status, result = Server.request(path, casino or Server.a, method, body)
            self.assertEqual(status, expected, result)
            return result

        settings = request("loyalty")
        tiers = settings["tiers"]
        self.assertEqual([tier["minimum_points"] for tier in tiers], [1000, 5000, 10000])
        self.assertTrue(all(tier["game_weight"] == 1 and tier["eur_per_point"] == 10 and
                            tier["cashback"] == 15 and tier["rakeback"] == 10 for tier in tiers))
        customer = request("customers")["items"][0]
        self.assertIsInstance(customer["loyalty_points"], int)
        original_time = customer["updated_at"]
        self.assertEqual(customer["loyalty_points"], 0)
        for value in [-1, 0.1, "1000", None, True, 9007199254740992]:
            request("customers/" + customer["id"], "PATCH", {"loyalty_points": value}, expected=422)
            self.assertEqual(request("customers/" + customer["id"])["loyalty_points"], 0)
            self.assertEqual(request("customers/" + customer["id"])["updated_at"], original_time)
        for value in [0, 1000, 9007199254740991, 2500]:
            self.assertEqual(request("customers/" + customer["id"], "PATCH", {"loyalty_points": value})["loyalty_points"], value)
        segment_id = request("segments")["items"][0]["id"]
        bonus_id = settings["bonus_options"][0]["id"]
        body = {"name": "Platinum", "minimum_points": 20000, "game_weight": 1.5, "eur_per_point": 5,
                "segment_ids": [segment_id], "bonus_ids": [bonus_id], "cashback": 20, "rakeback": 12.5}
        tier = request("loyalty/tiers", "POST", body, expected=201)
        self.assertEqual(tier["casino_id"], Server.a)
        for changes in [{"minimum_points": -1}, {"minimum_points": 1.5}, {"minimum_points": 1000},
                        {"minimum_points": True}, {"name": "Bronze"}, {"name": ""},
                        {"eur_per_point": 0}, {"game_weight": -1}, {"game_weight": "1"},
                        {"cashback": 101}, {"cashback": True}, {"rakeback": -1},
                        {"segment_ids": ["foreign"]}, {"segment_ids": [segment_id, segment_id]},
                        {"bonus_ids": ["foreign"]}, {"bonus_ids": [bonus_id, bonus_id]},
                        {"casino_id": Server.b}, {"formula": "other"}]:
            request("loyalty/tiers/" + tier["id"], "PATCH", changes, expected=422)
            saved = next(item for item in request("loyalty")["tiers"] if item["id"] == tier["id"])
            self.assertEqual(saved, tier)
        request("loyalty/tiers/" + tier["id"], "PATCH", {"name": "Foreign"}, casino=Server.b, expected=404)
        request("loyalty/tiers/" + tier["id"], "DELETE", casino=Server.b, expected=404)
        self.assertNotIn(tier["id"], [item["id"] for item in request("loyalty", casino=Server.b)["tiers"]])
        request("loyalty", "POST", {}, expected=405)
        request("loyalty/tiers/missing", "PATCH", {}, expected=404)
        request("loyalty/tiers/" + tier["id"], "PATCH", {"cashback": 0, "rakeback": 100})
        Server.stop()
        # Simulate upgrading an existing store with a mix of old and saved LP attributes.
        path = Path(Server.directory.name) / "casino_context.json"
        document = json.loads(path.read_text())
        profiles = document["tenants"][Server.a]["profiles"]
        other_id = next(key for key in profiles if key != customer["id"])
        del profiles[other_id]["loyalty_points"]
        updated_at = profiles[other_id]["updated_at"]
        path.write_text(json.dumps(document))
        Server.start()
        self.assertEqual(request("customers/" + customer["id"])["loyalty_points"], 2500)
        upgraded = request("customers/" + other_id)
        self.assertEqual(upgraded["loyalty_points"], 0)
        self.assertEqual(upgraded["updated_at"], updated_at)
        persisted = next(item for item in request("loyalty")["tiers"] if item["id"] == tier["id"])
        self.assertEqual(persisted["game_weight"], 1.5)
        self.assertEqual(persisted["bonus_ids"], [bonus_id])
        self.assertEqual(persisted["cashback"], 0)
        request("loyalty/tiers/" + tier["id"], "DELETE")
        self.assertEqual(request("customers/" + customer["id"])["loyalty_points"], 2500)
        for item in request("loyalty")["tiers"]:
            request("loyalty/tiers/" + item["id"], "DELETE")
        self.assertEqual(request("loyalty")["tiers"], [])
        Server.stop()
        Server.start()
        self.assertEqual(request("loyalty")["tiers"], [])


if __name__ == "__main__":
    unittest.main()
