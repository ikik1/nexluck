"""Verify seeded CRM Home cards in installed Chrome."""
import asyncio
from playwright.async_api import async_playwright
from casino_context_test import CasinoContextTests as Server


async def check():
    base = Server.base.removesuffix("/crm/ui-api/v1/")
    casinos = Server.request("casinos")[1]["items"]
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for casino in casinos:
            await page.goto(base + "/crm/?casino_context=" + casino["id"])
            await page.wait_for_function("document.querySelectorAll('#tiles .tile').length === 9")
            expected = Server.request("dashboard", casino["id"])[1]
            assert casino["name"] in await page.locator("#home-status").inner_text()
            assert "not live operational totals" in await page.locator("#home-status").inner_text()
            assert await page.locator("#tiles .kv b").count() == 36
            assert "Unavailable" not in await page.locator("#tiles").inner_text()
            for section, block in expected["sections"].items():
                card = page.locator(f'[data-section="{section}"]')
                assert await card.locator(".big").evaluate("node=>node.firstChild.textContent") == block["value"]
                assert await card.locator(".kv b").all_text_contents() == [metric["value"] for metric in block["metrics"]]
                assert "casino_context=" + casino["id"] in await card.get_attribute("href")
        await page.locator("#crm-context-select").select_option(Server.a)
        await page.wait_for_function("document.querySelectorAll('#tiles .tile').length === 9 && CRMContext.id === 'CS-0000000000000001'")
        await page.route("**/crm/ui-api/v1/dashboard", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Dashboard maintenance"}'))
        await page.reload()
        await page.get_by_text("Dashboard maintenance", exact=True).wait_for()
        assert await page.locator("#tiles .tile").count() == 0
        await page.unroute("**/crm/ui-api/v1/dashboard")
        await page.get_by_role("button", name="Retry dashboard").click()
        await page.wait_for_function("document.querySelectorAll('#tiles .tile').length === 9")
        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        await browser.close()


if __name__ == "__main__":
    Server.setUpClass()
    try:
        asyncio.run(check())
        print("Home Chrome checks passed: all casino cards, context switching, error/retry and mobile.")
    finally:
        Server.tearDownClass()
