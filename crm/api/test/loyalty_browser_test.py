"""Isolated Chrome workflow for Loyalty management, LP, progress and periods."""
import asyncio
import time
import casino_context_test as server
from playwright.async_api import async_playwright, expect

Server = server.CasinoContextTests


def request(path, method="GET", body=None, casino=None):
    status, payload = Server.request(path, casino or Server.a, method, body)
    assert status < 300, (status, payload)
    return payload


async def check():
    base = Server.base.removesuffix("/crm/ui-api/v1/")
    customer = request("customers")["items"][0]
    request("customers/" + customer["id"], "PATCH", {"loyalty_points": 1500})
    settings = request("loyalty")
    bronze = settings["tiers"][0]
    silver = settings["tiers"][1]
    segments = request("segments")["items"]
    required = next(item for item in segments if item["name"] == "VIP")
    bonus = settings["bonus_options"][0]
    ledger = request("finance")
    now = int(time.time() * 1000)
    active = {wallet["customer_id"] for wallet in ledger["wallets"] if any(
        tx["wallet"] == wallet["id"] and tx["type"] == "Bet" and now - 30 * 86400000 <= tx["ts"] <= now
        for tx in ledger["wallet_transactions"])}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(20000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/?casino_context=" + Server.a)
        tile = page.locator('[data-section="loyalty"]')
        await tile.wait_for()
        assert "/crm/loyalty/" in await tile.get_attribute("href")
        await tile.click()
        await page.get_by_role("heading", name="Active customers by tier", exact=True).wait_for()
        await expect(page.locator(".loyalty-stat")).to_have_count(4)
        values = await page.locator(".loyalty-stat strong").all_text_contents()
        assert sum(map(int, values)) == len(active)
        await page.locator('.loyalty-tier[data-tier-id="' + silver["id"] + '"]').get_by_role("button", name="Edit tier").click()
        dialog = page.get_by_role("dialog", name="Edit tier", exact=True)
        assert await dialog.get_by_label("Total bet amount", exact=True).get_attribute("readonly") is not None
        assert await dialog.get_by_label("Game weight", exact=True).input_value() == "1"
        assert await dialog.get_by_label("Point rate: EUR per 1 LP", exact=True).input_value() == "10"
        await dialog.get_by_label("Game weight", exact=True).fill("2")
        await dialog.get_by_label("Point rate: EUR per 1 LP", exact=True).fill("5")
        await dialog.get_by_label("Minimum LP", exact=True).fill("2000")
        await dialog.get_by_label(required.get("tag_name") or required["name"], exact=True).check()
        await dialog.get_by_label(bonus["name"], exact=True).check()
        await dialog.get_by_label("Cashback (%)", exact=True).fill("18")
        await dialog.get_by_label("Rakeback (%)", exact=True).fill("12")
        await dialog.get_by_role("button", name="Save tier", exact=True).click()
        await dialog.wait_for(state="hidden")
        await page.locator('.loyalty-tier[data-tier-id="' + silver["id"] + '"]').get_by_text("18%", exact=True).wait_for()
        saved = next(tier for tier in request("loyalty")["tiers"] if tier["id"] == silver["id"])
        assert saved["segment_ids"] == [required["id"]] and saved["bonus_ids"] == [bonus["id"]]
        assert saved["game_weight"] == 2 and saved["eur_per_point"] == 5
        await page.get_by_role("button", name="Add tier", exact=True).click()
        dialog = page.get_by_role("dialog", name="Add tier", exact=True)
        await dialog.get_by_label("Tier name", exact=True).fill("Platinum")
        await dialog.get_by_role("button", name="Save tier", exact=True).click()
        await dialog.get_by_text("Each tier must have a different LP threshold", exact=True).wait_for()
        await dialog.get_by_label("Minimum LP", exact=True).fill("20000")
        await dialog.get_by_role("button", name="Save tier", exact=True).click()
        await dialog.wait_for(state="hidden")
        await page.get_by_role("heading", name="Tier 4: Platinum", exact=True).wait_for()
        assert await page.locator(".loyalty-stat").count() == 5
        await page.get_by_label("Period", exact=True).select_option("custom")
        await page.get_by_label("From (UTC)", exact=True).fill("2000-01-01")
        await page.get_by_label("To (UTC)", exact=True).fill("2000-01-02")
        assert all(value == "0" for value in await page.locator(".loyalty-stat strong").all_text_contents())
        await page.goto(base + "/crm/c/i/?id=" + customer["id"] + "&casino_context=" + Server.a)
        progress = page.get_by_role("progressbar", name="Progress to next tier", exact=True)
        await progress.wait_for()
        assert await progress.get_attribute("value") == "50"
        assert "Silver" in await page.get_by_text("Next tier:", exact=False).inner_text()
        points = page.get_by_label("Loyalty points (LP)", exact=True)
        await points.fill("2500")
        await page.get_by_role("button", name="Save points", exact=True).click()
        await page.get_by_text("Loyalty points saved.", exact=True).wait_for()
        assert await progress.get_attribute("value") == "100"
        assert await page.get_by_text("Required segments still to match:", exact=False).count() == 1
        assert request("customers/" + customer["id"])["loyalty_points"] == 2500
        await page.reload()
        await points.wait_for()
        assert await points.input_value() == "2500"
        # A deposit/login does not make someone active; bet counts use current tier.
        await page.goto(base + "/crm/loyalty/?casino_context=" + Server.a)
        await page.get_by_role("heading", name="Tier settings", exact=True).wait_for()
        platinum = page.locator(".loyalty-tier").filter(has_text="Platinum")
        await platinum.get_by_role("button", name="Remove tier", exact=True).click()
        dialog = page.get_by_role("dialog", name="Remove tier: Platinum", exact=True)
        await dialog.get_by_role("button", name="Remove tier", exact=True).click()
        await dialog.wait_for(state="hidden")
        await expect(page.locator(".loyalty-stat")).to_have_count(4)
        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        # Independent casino configuration must not inherit edited tiers.
        await page.goto(base + "/crm/loyalty/?casino_context=" + Server.b)
        await page.get_by_role("heading", name="Tier settings", exact=True).wait_for()
        assert "5,000 LP" in await page.locator(".loyalty-tiers").inner_text()
        assert "18%" not in await page.locator(".loyalty-tiers").inner_text()
        await page.get_by_role("combobox", name="UI language", exact=True).select_option("ru")
        await page.get_by_role("heading", name="Настройки уровней", exact=True).wait_for()
        await page.get_by_role("button", name="Добавить уровень", exact=True).click()
        await page.get_by_role("dialog", name="Добавить уровень", exact=True).wait_for()
        await page.get_by_role("button", name="Отмена", exact=True).click()
        assert not errors, errors
        await browser.close()
    Server.stop()
    Server.start()
    assert request("customers/" + customer["id"])["loyalty_points"] == 2500
    persisted = next(tier for tier in request("loyalty")["tiers"] if tier["id"] == silver["id"])
    assert persisted["cashback"] == 18
    print("Loyalty browser: Home link, tier CRUD, segment/bonus choices, formula defaults/edits, bet periods, LP progress/segment gates, mobile, isolation and restart passed.")


if __name__ == "__main__":
    Server.setUpClass()
    try:
        asyncio.run(check())
    finally:
        Server.tearDownClass()
