"""Persisted, casino-scoped demo activity histories and customer profile UI."""
import asyncio
import os
import subprocess
import unittest
from datetime import datetime
from playwright.async_api import async_playwright, expect
import casino_context_test as server

Server = server.CasinoContextTests


class CustomerActivityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Server.setUpClass()

    @classmethod
    def tearDownClass(cls):
        Server.tearDownClass()

    def request(self, path, casino=None, method="GET", body=None, expected=200):
        status, data = Server.request(path, casino or Server.a, method, body)
        self.assertEqual(status, expected, data)
        return data

    def test_api_histories_filters_and_persistence(self):
        customers = self.request("customers")["items"]
        event_types = set()
        for customer in customers:
            path = "customers/" + customer["id"] + "/activity"
            data = self.request(path + "?limit=100")
            self.assertEqual(data["total"], 17)
            self.assertEqual(len(data["items"]), 17)
            self.assertEqual(len({event["id"] for event in data["items"]}), 17)
            self.assertEqual([event["created_at"] for event in data["items"]],
                             sorted((event["created_at"] for event in data["items"]), reverse=True))
            for event in data["items"]:
                self.assertEqual(event["customer_id"], customer["id"])
                self.assertEqual(event["casino_id"], Server.a)
                self.assertEqual(event["user_name"], customer["name"])
                self.assertIn(event["event_tag"], data["tags"])
                self.assertTrue(event["session_id"])
                self.assertTrue(event["details"])
                self.assertTrue(event["demo"])
                self.assertGreaterEqual(datetime.fromisoformat(event["created_at"].replace("Z", "+00:00")),
                                        datetime.fromisoformat(customer["created_at"].replace("Z", "+00:00")))
                event_types.add(event["event_type"])
        self.assertEqual(len(event_types), 16)
        path = "customers/" + customers[0]["id"] + "/activity"
        initial = self.request(path)
        self.assertEqual(len(initial["items"]), 10)
        self.assertEqual(initial["items"][0]["event_type"], "Removed from segment")
        for tag in initial["tags"]:
            filtered = self.request(path + "?tag=" + tag)
            self.assertTrue(filtered["items"])
            self.assertTrue(all(event["event_tag"] == tag for event in filtered["items"]))
        last_day = initial["items"][0]["created_at"][:10]
        dates = self.request(path + "?from=" + last_day + "&to=" + last_day)
        self.assertTrue(dates["items"])
        self.assertTrue(all(event["created_at"].startswith(last_day) for event in dates["items"]))
        self.assertEqual(self.request(path + "?to=2000-01-01")["total"], 0)
        self.assertEqual(len(self.request(path + "?offset=10")["items"]), 7)
        self.assertEqual(self.request(path + "?offset=100")["items"], [])
        for query in ["tag=unknown", "from=2026-02-30", "to=bad", "from=2026-12-01&to=2026-01-01",
                      "limit=0", "limit=101", "offset=-1", "offset=x", "other=yes"]:
            self.request(path + "?" + query, expected=422)
        self.request(path, method="POST", body={}, expected=405)
        self.request("customers/CU-999/activity", expected=404)
        self.request(path, casino=Server.b, expected=404)
        # Seed customers in another casino too, without mixing their histories.
        self.request("compliance", casino=Server.b)
        foreign = self.request("customers", casino=Server.b)["items"][0]
        foreign_events = self.request("customers/" + foreign["id"] + "/activity", casino=Server.b)
        self.assertTrue(all(event["casino_id"] == Server.b for event in foreign_events["items"]))
        Server.stop()
        Server.start()
        self.assertEqual(self.request(path), initial)
        # Authenticated mode must not generate demo records or alter state.
        check = subprocess.run(["ruby", "-r", "./crm/api/customer_activity",
            "-e", "o=Object.new.extend(CustomerActivity); s={}; o.instance_variable_set(:@state,s); "
                  "abort 'unexpected seeding' unless o.prepare_customer_activity == false && s.empty?"],
            cwd=server.ROOT, env={**os.environ, "CRM_UI_MODE": "authenticated"}, capture_output=True, text=True)
        self.assertEqual(check.returncode, 0, check.stderr)

    def test_browser_profile_layout_and_filters(self):
        asyncio.run(self.browser())

    async def browser(self):
        base = Server.base.removesuffix("/crm/ui-api/v1/")
        customer = self.request("customers")["items"][0]
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(channel="chrome", headless=True)
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            page.set_default_timeout(15000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto(base + "/crm/c/i/?id=" + customer["id"] + "&casino_context=" + Server.a)
            logs = page.get_by_role("region", name="Activity info", exact=True)
            await expect(logs.locator(".activity-log-list > li")).to_have_count(10)
            center = await page.locator(".customer-center").bounding_box()
            activity = await logs.bounding_box()
            self.assertAlmostEqual(center["x"], activity["x"], delta=1)
            self.assertGreaterEqual(activity["y"], center["y"] + center["height"])
            self.assertEqual(await logs.locator(".activity-log-list > li").first.locator("strong").inner_text(), "Removed from segment")
            self.assertIn(customer["name"], await logs.inner_text())
            self.assertIn("Session ID", await logs.inner_text())
            await logs.get_by_role("button", name="Next", exact=True).click()
            await expect(logs.locator(".activity-log-list > li")).to_have_count(7)
            await logs.get_by_label("Event tag", exact=True).select_option("game")
            await expect(logs.locator(".activity-log-list > li")).to_have_count(2)
            self.assertIn("Round start", await logs.inner_text())
            self.assertIn("Round end", await logs.inner_text())
            self.assertIn("Game external ID", await logs.inner_text())
            await logs.get_by_label("Activity from (UTC)", exact=True).fill("2000-01-01")
            await logs.get_by_label("Activity to (UTC)", exact=True).fill("2000-01-02")
            await logs.get_by_text("No activity logs match these filters.", exact=True).wait_for()
            await logs.get_by_role("button", name="Clear filters", exact=True).click()
            await expect(logs.locator(".activity-log-list > li")).to_have_count(10)
            await page.route("**/customers/*/activity?*", lambda route: route.fulfill(
                status=503, content_type="application/json", body='{"error":"Activity service unavailable"}'))
            await page.reload()
            await logs.get_by_role("alert").get_by_text("Activity service unavailable", exact=False).wait_for()
            await page.unroute("**/customers/*/activity?*")
            await logs.get_by_role("button", name="Retry", exact=True).click()
            await expect(logs.locator(".activity-log-list > li")).to_have_count(10)
            for width in [390, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                self.assertTrue(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            await page.get_by_role("combobox", name="UI language", exact=True).select_option("ru")
            await page.get_by_role("heading", name="Журнал активности", exact=True).wait_for()
            self.assertEqual(errors, [])
            await browser.close()


if __name__ == "__main__":
    unittest.main()
