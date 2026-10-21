"""Casino context UI integration checks using installed Google Chrome."""
import asyncio
import json

from playwright.async_api import async_playwright
from casino_context_test import CasinoContextTests


async def check():
    server = CasinoContextTests
    base = server.base.removesuffix("/crm/ui-api/v1/")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        other = await context.new_page()
        errors = []
        for tab in (page, other):
            tab.set_default_timeout(20000)
            tab.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/b/")
        await page.wait_for_function("CRMContext.id === 'CS-0000000000000001'")
        await page.locator("tr[data-id]").first.wait_for()
        assert await page.locator("tr[data-id]").count() == 20
        assert "casino_context=" + server.a in page.url
        assert await page.locator("#crm-context-select").input_value() == server.a

        await other.goto(base + "/crm/c/list/?casino_context=" + server.b)
        await other.get_by_text("No customers match these filters.", exact=True).wait_for()
        assert await other.locator("#crm-context-select").input_value() == server.b
        assert await page.locator("#crm-context-select").input_value() == server.a
        await other.reload()
        await other.wait_for_function("CRMContext.id === 'CS-0000000000000002'")
        assert await other.locator("#crm-context-select").input_value() == server.b
        await other.locator("#crm-context-select").select_option(server.a)
        await other.get_by_role("link", name="luna.play", exact=True).wait_for()
        assert await page.locator("#crm-context-select").input_value() == server.a

        await page.goto(base + "/crm/c/l/")
        first = page.locator(f'tr[data-website-id="{server.a}"]')
        second = page.locator(f'tr[data-website-id="{server.b}"]')
        await first.get_by_text("Current context", exact=True).wait_for()
        before = await second.locator("time").all_text_contents()
        await second.click(button="right")
        await page.get_by_role("menuitem", name="Set as CRM Context", exact=True).click()
        await second.get_by_text("Current context", exact=True).wait_for()
        assert await page.locator("tr[data-website-id]").count() == 5
        assert await second.locator("time").all_text_contents() == before
        assert await other.locator("#crm-context-select").input_value() == server.a

        await page.get_by_role("button", name="Add new web-site", exact=True).click()
        dialog = page.get_by_role("dialog", name="Add new web-site", exact=True)
        await dialog.get_by_label("Name", exact=True).fill("Fresh empty casino")
        await dialog.get_by_label("URL", exact=True).fill("https://fresh.example")
        assert await dialog.get_by_label("Copy configuration from casino").input_value() == ""
        await dialog.get_by_role("button", name="Add web-site", exact=True).click()
        await dialog.wait_for(state="hidden")
        await page.get_by_text("Fresh empty casino created.", exact=False).wait_for()
        assert await page.locator("#crm-context-select").input_value() == server.b
        new_site = next(site for site in server.request("casinos")[1]["items"] if site["name"] == "Fresh empty casino")
        assert server.request("customers", new_site["id"])[1]["total"] == 0
        assert server.request("finance", new_site["id"])[1]["wallets"] == []

        await page.get_by_role("button", name="Add new web-site", exact=True).click()
        dialog = page.get_by_role("dialog", name="Add new web-site", exact=True)
        await dialog.get_by_label("Name", exact=True).fill("Copied games casino")
        await dialog.get_by_label("URL", exact=True).fill("https://copied.example")
        await dialog.get_by_label("Copy configuration from casino").select_option(server.a)
        await dialog.get_by_text("Copy preview", exact=True).wait_for()
        assert await dialog.locator('input[type="checkbox"]:checked').count() == 0
        await dialog.get_by_label("Games", exact=True).check()
        await dialog.get_by_text("Catalogs (required dependency)", exact=True).wait_for()
        await dialog.get_by_text("Segments (required dependency)", exact=True).wait_for()
        await dialog.get_by_role("button", name="Add web-site", exact=True).click()
        await dialog.wait_for(state="hidden")
        copied = next(site for site in server.request("casinos")[1]["items"] if site["name"] == "Copied games casino")
        assert server.request("games", copied["id"])[1]["total"] == 100
        assert server.request("finance", copied["id"])[1]["connections"] == []

        await page.goto(base + "/crm/b/e/?id=BN-1001&casino_context=" + server.a)
        bonus_name = page.locator(".card.center input[type=text]").first
        await bonus_name.fill("Unsaved scoped bonus")
        await page.locator("#crm-context-select").select_option(server.b)
        await page.get_by_text("Discard unsaved changes and switch casino?", exact=True).wait_for()
        await page.get_by_role("button", name="Stay", exact=True).click()
        assert await bonus_name.input_value() == "Unsaved scoped bonus"
        assert await page.locator("#crm-context-select").input_value() == server.a
        await page.locator("#crm-context-select").select_option(server.b)
        await page.get_by_role("button", name="Discard and switch", exact=True).click()
        await page.wait_for_url("**/crm/b/?casino_context=" + server.b)
        await page.get_by_role("heading", name="Bonuses", exact=False).wait_for()
        assert await page.locator("tr[data-id]").count() == 0

        await page.goto(base + "/crm/b/?casino_context=" + server.a)
        bonus = page.locator('tr[data-id="BN-1001"]')
        await bonus.wait_for()
        saving, release = asyncio.Event(), asyncio.Event()

        async def delayed_save(route):
            saving.set()
            await release.wait()
            await route.continue_()

        await page.route("**/bonuses/BN-1001/delete", delayed_save)
        await bonus.click(button="right")
        await page.get_by_text("Mark as deleted", exact=True).click()
        await saving.wait()
        await page.locator("#crm-context-select").select_option(server.b)
        await page.get_by_text("A save is in progress. Wait for its result before changing casino.", exact=True).wait_for()
        assert await page.locator("#crm-context-select").input_value() == server.a
        release.set()
        await page.wait_for_function("document.querySelector('tr[data-id=\"BN-1001\"]').classList.contains('deleted')")
        await page.unroute("**/bonuses/BN-1001/delete", delayed_save)
        assert server.request("bonuses/BN-1001", server.a)[1]["deleted"]
        assert server.request("bonuses/BN-1001", server.b)[0] == 404

        await page.goto(base + "/crm/a/?casino_context=" + server.a)
        await page.get_by_role("heading", name="Filter every report", exact=True).wait_for()
        await page.get_by_label("Casino website", exact=True).select_option(index=1)
        before = await page.locator(".analytics-kpi").all_text_contents()
        filters = await page.locator(".analytics-filters input, .analytics-filters select").evaluate_all(
            "nodes=>nodes.map(node=>node.value)")
        await page.locator("#crm-context-select").select_option(server.b)
        await page.wait_for_function("CRMContext.id === 'CS-0000000000000002'")
        assert await page.locator(".analytics-kpi").all_text_contents() == before
        assert await page.locator(".analytics-filters input, .analytics-filters select").evaluate_all(
            "nodes=>nodes.map(node=>node.value)") == filters

        await page.goto(base + "/crm/g/?casino_context=" + server.b)
        await page.locator("tr[data-game-id]").first.wait_for()
        assert await page.locator("tr[data-game-id]").count() == 100
        assert await page.locator('tr[data-game-id="gates-of-olympus"]').count() == 0
        await page.goto(base + "/crm/f/wallets/?casino_context=" + server.b)
        await page.get_by_role("heading", name="Wallets", exact=False).wait_for()
        assert await page.locator('tbody tr').count() == 0

        server.request("casinos/" + server.b, method="PATCH", body={"enabled": False})
        await page.reload()
        await page.get_by_text("This casino website is disabled. CRM editing is still available.", exact=False).wait_for()
        await page.goto(base + "/crm/b/?casino_context=CS-ffffffffffffffff")
        await page.get_by_text("The requested casino context is unavailable or not permitted.", exact=False).first.wait_for()
        assert await page.locator("tr[data-id]").count() == 0
        await page.locator("#crm-context-select").select_option(server.a)
        await page.locator("tr[data-id]").first.wait_for()

        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.locator("#crm-context-select").is_visible()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile page overflows horizontally"
        insets = await page.locator("#crm-context-select").evaluate(
            "node => {const style=getComputedStyle(node);return [style.paddingLeft,style.backgroundPositionX]}")
        assert insets[0] == "12px" and insets[1] in ("right 12px", "calc(100% - 12px)"), insets
        assert not errors, json.dumps(errors)
        await browser.close()


if __name__ == "__main__":
    CasinoContextTests.setUpClass()
    try:
        asyncio.run(check())
        print("Context Chrome checks passed: tabs, row/header actions, cloning, dirty guards, Analytics, disabled/invalid contexts and mobile.")
    finally:
        CasinoContextTests.tearDownClass()
