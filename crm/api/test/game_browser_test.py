"""Run with python3 crm/api/test/game_browser_test.py (Playwright + Chrome)."""
import asyncio
import os
from pathlib import Path
import secrets
import socket
import tempfile
import urllib.request

from playwright.async_api import async_playwright
from segment_browser_test import request, start, token

API = "/crm/ui-api/v1/games"


async def browser_checks(base):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/")
        await page.locator('a[href="/crm/g/"]').first.click()
        await page.locator("tr[data-game-id]").first.wait_for()
        assert await page.title() == "NexLuck CRM — Games"
        assert await page.get_by_role("combobox", name="Navigate to", exact=True).count() == 1
        assert await page.locator("tr[data-game-id]").count() == 12
        assert await page.locator(".publisher-row").count() == 5
        assert await page.locator(".publisher-heading img").evaluate_all("imgs => imgs.every(i => i.complete && i.naturalWidth > 0)")
        assert await page.locator(".game-provider-default").first.inner_text() == "(100%)"
        assert await page.locator(".game-provider-default").first.evaluate("e => getComputedStyle(e).color") == "rgb(119, 119, 119)"
        assert "5%" in await page.locator('tr[data-game-id="gates-of-olympus"]').inner_text()
        for label, value in [("Status", "disabled"), ("Publisher", "spribe"),
                             ("Deposit currency", "CAD"), ("Variance", "low"),
                             ("Attribute", "jackpot"), ("Segment", "REGISTERED"), ("Tag", "popular")]:
            await page.get_by_label(label, exact=True).select_option(value)
            assert await page.locator("tr[data-game-id]").count() > 0, label
            await page.get_by_role("button", name="Clear filters", exact=True).click()
        await page.get_by_label("Search games", exact=True).fill("not-existing")
        assert await page.get_by_text("No games match the filters.", exact=True).count() == 1
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        await page.get_by_label("Publisher", exact=True).select_option("spribe")
        await page.get_by_label("Attribute", exact=True).select_option("jackpot")
        assert await page.locator("tr[data-game-id]").count() == 0
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        row = page.locator('tr[data-game-id="gates-of-olympus"]')
        await row.click(button="right")
        await page.get_by_role("menuitem", name="Disable game", exact=True).click()
        await page.wait_for_function("document.querySelector('[data-game-id=\"gates-of-olympus\"]').classList.contains('disabled')")
        await row.click(button="right")
        await page.get_by_role("menuitem", name="Enable game", exact=True).click()
        await page.wait_for_function("document.querySelector('[data-game-id=\"gates-of-olympus\"]').classList.contains('enabled')")
        await page.get_by_role("button", name="Game categories", exact=True).click()
        cats = page.get_by_role("dialog", name="Game categories", exact=True)
        await cats.get_by_label("Search categories", exact=True).fill("Slots")
        await cats.get_by_role("checkbox", name="Slots", exact=True).check()
        await cats.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator("tr[data-game-id]").count() == 4
        await page.get_by_role("button", name="Remove category filter Slots", exact=True).click()
        await page.get_by_role("button", name="Game categories", exact=True).click()
        await cats.get_by_role("button", name="+ New category", exact=True).click()
        await cats.get_by_label("Category name", exact=True).fill("Featured games")
        await cats.get_by_role("button", name="Save category", exact=True).click()
        await cats.get_by_role("button", name="Edit category Featured games", exact=True).click()
        await cats.get_by_label("Category name", exact=True).fill("Featured")
        await cats.get_by_role("button", name="Save category", exact=True).click()
        await cats.get_by_role("button", name="Edit category Featured", exact=True).wait_for()
        await cats.get_by_role("button", name="Done", exact=True).click()
        await row.dblclick()
        editor = page.get_by_role("dialog", name="Edit game: Gates of Olympus", exact=True)
        await editor.get_by_label("Name", exact=True).fill("Gates catalog edited")
        await editor.get_by_label("ExternalID", exact=True).fill("friendly-gates")
        await editor.get_by_label("Category", exact=True).select_option(label="Featured")
        await editor.get_by_label("Tags (comma separated)", exact=True).fill("featured, tested")
        await editor.get_by_label("RTP %", exact=True).fill("97.25")
        await editor.get_by_label("Bonus contribution override %", exact=True).fill("7.5")
        await editor.get_by_label("Multiplier", exact=True).fill("123.45")
        await editor.get_by_label("Variance", exact=True).select_option("high")
        await editor.get_by_role("checkbox", name="Jackpot", exact=True).check()
        await editor.get_by_role("button", name="Edit game segments", exact=True).click()
        segments = page.get_by_role("dialog", name="Segments", exact=True)
        await segments.get_by_label("Select segment VIP", exact=True).dblclick()
        await page.keyboard.press("Escape")
        assert await editor.count() == 1
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert await editor.evaluate("e => e.getBoundingClientRect().right <= innerWidth && e.scrollWidth <= e.clientWidth")
        await editor.get_by_role("button", name="Save game", exact=True).click()
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).wait_for()
        await page.reload()
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).click()
        editor = page.get_by_role("dialog", name="Edit game: Gates catalog edited", exact=True)
        assert await editor.get_by_label("ExternalID", exact=True).input_value() == "friendly-gates"
        assert await editor.get_by_label("Multiplier", exact=True).input_value() == "123.45"
        assert await editor.get_by_role("button", name="Remove segment VIP", exact=True).count() == 1
        await editor.get_by_label("Bonus contribution override %", exact=True).fill("")
        await editor.get_by_role("button", name="Save game", exact=True).click()
        await editor.wait_for(state="hidden")
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).wait_for()
        assert "100%(100%)" in (await row.inner_text()).replace(" ", "").replace("\t", "").replace("\n", "")
        await page.goto(base + "/g/")
        await page.wait_for_url("**/crm/g/")
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).wait_for()
        await page.route("**/crm/ui-api/v1/games", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Catalog temporarily unavailable"}'))
        await page.reload()
        await page.get_by_role("alert").get_by_text("Catalog temporarily unavailable", exact=False).wait_for()
        await page.unroute("**/crm/ui-api/v1/games")
        await page.get_by_role("button", name="Retry", exact=True).click()
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).wait_for()
        assert not errors, errors
        await browser.close()
        print("Games browser: grouping/logos, filters, categories, edit, status menu, segment picker, mobile and reload passed")


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="nexluck-game-test-") as storage:
        env = dict(os.environ, CRM_CUSTOMER_DATA_DIR=storage, CRM_CLIENT_ID="segment-test",
                   CRM_CLIENT_SECRET=secrets.token_hex(24), CRM_JWT_SECRET=secrets.token_hex(32))
        server = start(port, env)
        try:
            assert request(base, "/crm/api/v1/games")[0] == 401
            read = token(base, env, "games:read")
            write = token(base, env, "games:write")
            legacy = token(base, env, "bonuses:read")
            assert request(base, "/crm/api/v1/games", token=read)[0] == 200
            assert request(base, "/crm/api/v1/games", token=legacy)[0] == 200
            assert request(base, "/crm/api/v1/games/publishers")[0] == 401
            assert request(base, "/crm/api/v1/games/publishers", token=read)[0] == 200
            assert request(base, "/crm/api/v1/games/categories", "POST", {"name": "Blocked"}, read)[0] == 403
            assert request(base, "/crm/api/v1/games/gates-of-olympus", "PATCH", {"enabled": False}, read)[0] == 403
            assert request(base, "/crm/api/v1/games/gates-of-olympus", "PATCH", {"enabled": True}, write)[0] == 200
            assert request(base, API + "/missing")[0] == 404
            assert request(base, API + "/categories/missing", "PATCH", {"name": "Test"})[0] == 404
            game = request(base, API + "/gates-of-olympus")[1]
            for body in [{"rtp": 101}, {"rtp": True}, {"multiplier": -1}, {"variance": "unknown"},
                         {"bonus_contribution": -1}, {"enabled": "yes"}, {"category": "missing"},
                         {"deposit_currencies": []}, {"attributes": ["invalid"]}, {"name": ""},
                         {"external_id": "sweet-bonanza"}, {"tags": [123]}, {"segments": ["missing"]},
                         {"deposit_currencies": ["FAKE"]},
                         {"provider_bonus_contribution": 1}, {"publisher_id": "other"}, {"id": "changed"},
                         {"created_at": "changed"}, {"unexpected": True}]:
                assert request(base, API + "/gates-of-olympus", "PATCH", body)[0] == 422, body
                assert request(base, API + "/gates-of-olympus")[1] == game
            assert request(base, API + "/categories", "POST", {"name": "slots"})[0] == 422
            assert request(base, API + "/categories", "POST", {"name": "  "})[0] == 422
            asyncio.run(browser_checks(base))
            # All original IDs remain available to the bonus editor.
            assert {g["id"] for g in request(base, API)[1]["items"]} == {
                "gates-of-olympus", "sweet-bonanza", "book-of-dead", "starburst", "european-roulette",
                "blackjack-classic", "baccarat-punto-banco", "live-roulette", "live-blackjack",
                "live-baccarat", "aviator", "spaceman"}
            spec = urllib.request.urlopen(base + "/crm/openapi.yaml").read().decode()
            for path in ["/games/{id}:", "/games/publishers:", "/games/categories:", "/games/categories/{categoryId}:"]:
                assert path in spec
            assert request(base, API + "/gates-of-olympus", "PATCH", {"enabled": False})[0] == 200
        finally:
            server.terminate()
            server.wait(timeout=10)
        server = start(port, env)
        try:
            saved = request(base, API + "/gates-of-olympus")[1]
            assert saved["name"] == "Gates catalog edited" and saved["enabled"] is False
            assert saved["multiplier"] == 123.45 and saved["bonus_contribution"] is None
            assert saved["provider_bonus_contribution"] == 100
            assert saved["rtp"] == 97.25 and saved["tags"] == ["featured", "tested"]
            assert "VIP" in saved["segments"]
            assert any(c["name"] == "Featured" and c["id"] == saved["category"] for c in request(base, API + "/categories")[1]["items"])
            assert Path(storage, "games.json").stat().st_mode & 0o777 == 0o600
            assert Path(storage).stat().st_mode & 0o777 == 0o700
            print("Games API: scopes, atomic validation, provider defaults, categories, private storage and restart persistence passed")
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
