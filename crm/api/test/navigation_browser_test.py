"""Run with python3 crm/api/test/navigation_browser_test.py."""
import asyncio
import os
from pathlib import Path
import secrets
import socket
import tempfile

from playwright.async_api import async_playwright
from segment_browser_test import start

ROOT = Path(__file__).resolve().parents[3]


async def check(base):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/")
        await page.locator('#tiles [data-section="games"]').wait_for()
        assert await page.locator(".crm-navigation").is_hidden()
        await page.mouse.move(900, 700)
        assert await page.locator(".crm-navigation").is_hidden()
        await page.locator("#sub").hover()
        assert await page.locator(".crm-navigation").evaluate(
            "e => e.getAnimations().some(a => a.effect.getTiming().duration === 240)")
        await page.locator(".crm-navigation").wait_for(state="visible")
        await page.wait_for_timeout(1400)
        assert await page.locator(".crm-navigation").is_visible()
        await page.mouse.move(900, 700)
        await page.wait_for_timeout(300)
        assert await page.locator(".crm-navigation").is_hidden()
        reveal = page.get_by_role("button", name="AI navigation", exact=True)
        assert await reveal.locator("svg").count() == 1
        assert await reveal.inner_text() == ""
        await reveal.click()
        await page.get_by_role("button", name="Pin navigation", exact=True).click()
        await page.get_by_role("heading", name="Operator Console", exact=True).click()
        await page.mouse.move(900, 700)
        await page.wait_for_timeout(1400)
        assert await page.locator(".crm-navigation").is_visible()
        await page.reload()
        await page.wait_for_timeout(1400)
        assert await page.locator(".crm-navigation").is_visible()
        assert await page.get_by_role("button", name="Unpin navigation", exact=True).get_attribute("aria-pressed") == "true"
        await page.goto(base + "/crm/g/")
        await page.wait_for_timeout(1400)
        assert await page.locator(".crm-navigation").is_visible()
        await page.get_by_role("button", name="Unpin navigation", exact=True).click()
        await page.get_by_role("heading", name="Games", exact=True).click()
        await page.mouse.move(900, 700)
        await page.wait_for_timeout(300)
        assert await page.locator(".crm-navigation").is_hidden()
        await page.get_by_role("button", name="AI navigation", exact=True).click()
        nav = page.get_by_role("combobox", name="Navigate to", exact=True)
        await page.mouse.move(900, 700)
        await page.wait_for_timeout(1400)
        assert await nav.is_visible()
        await page.get_by_role("button", name="Pin navigation", exact=True).click()
        await nav.fill("Show me list of ga")
        assert await page.get_by_role("option", name="List of games", exact=False).count() == 1
        await nav.press("Tab")
        assert await nav.input_value() == "Show me list of games"
        await nav.press("Enter")
        await page.wait_for_url("**/crm/g/**")
        await page.locator("#crm-nav-recent").get_by_role("button", name="Show me list of games", exact=True).wait_for()
        await nav.fill("list of customers")
        await nav.press("Enter")
        await page.wait_for_url("**/crm/c/list/**")
        await page.locator("#crm-nav-recent").get_by_role("button", name="Show me list of games", exact=True).click()
        await page.wait_for_url("**/crm/g/**")
        await nav.fill("customer CU-1001")
        await nav.press("Enter")
        await page.wait_for_url("**/crm/c/i/?id=CU-1001*")
        await nav.fill("edit bonus BN-1001")
        await nav.press("Enter")
        await page.wait_for_url("**/crm/b/e/?id=BN-1001*")
        await nav.fill("random unmatched words")
        assert await page.locator("#crm-nav-status").inner_text() == "No CRM page matches. Try games, customers, bonuses, or API docs."
        await nav.press("Enter")
        assert "/crm/b/e/" in page.url
        await nav.fill("list of")
        await nav.press("ArrowDown")
        await nav.press("Escape")
        assert await nav.get_attribute("aria-expanded") == "false"
        await nav.fill("swagger")
        await nav.press("Enter")
        await page.wait_for_url("**/crm/api-docs/**")
        await nav.wait_for()
        # Every static CRM HTML entry point is represented by a route or a
        # parameterized detail template; no customer-facing routes are indexed.
        indexed = await page.evaluate("CRM_PAGE_INDEX.flatMap(p => p.template ? [p.href,p.template] : [p.href])")
        for html in (ROOT / "crm").rglob("*.html"):
            route = "/" + html.relative_to(ROOT).as_posix()
            if route.endswith("/index.html"):
                route = route[:-len("index.html")]
            assert any(url.split("?")[0] == route for url in indexed), route
        assert all(url.startswith("/crm/") for url in indexed)
        section_keys = await page.evaluate("SECTIONS.map(s=>s.k)")
        assert len(section_keys) == 9
        for key, phrase, destination in [
            ("home", "home", "/crm/"),
            ("analytics", "show me analytics", "/crm/a/"),
            ("casinos", "my casinos", "/crm/c/l/"),
            ("loyalty", "loyalty", "/crm/section.html?s=loyalty"),
            ("compliance", "compliance", "/crm/section.html?s=compliance"),
            ("audit", "audit", "/crm/section.html?s=audit"),
            ("wallets", "list of wallets", "/crm/f/wallets/"),
            ("transactions", "transactions", "/crm/f/transactions/"),
            ("cascades", "payment cascades", "/crm/f/cascades/"),
            ("finance", "payment connections", "/crm/f/"),
            ("bonuses", "list of bonuses", "/crm/b/"),
            ("new-bonus", "new bonus", "/crm/b/e/?new=1"),
            ("ai-bonus", "ai bonus", "/crm/b/e/?new=1&ai=1")
        ]:
            found = await page.evaluate("(phrase) => crmNavigationMatches(phrase).map(p => ({key:p.key,href:p.href}))", phrase)
            assert any(p["key"] == key and p["href"] == destination for p in found), (phrase, found)
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            await nav.fill("list of games")
            assert await page.locator("#crm-nav-form").evaluate("e => e.getBoundingClientRect().right <= innerWidth")
            assert await page.locator("#crm-nav-options").evaluate("e => e.getBoundingClientRect().right <= innerWidth")
        await page.reload()
        assert await page.locator("#crm-nav-recent .crm-nav-tag").count() > 0
        await page.get_by_role("button", name="Clear recent requests", exact=True).click()
        assert await page.locator("#crm-nav-recent .crm-nav-tag").count() == 0
        await page.reload()
        assert await page.locator("#crm-nav-recent .crm-nav-tag").count() == 0
        await page.evaluate("localStorage.setItem('nexluck.crm.navigation.requests.v1', 'not-json')")
        await page.reload()
        assert "could not be loaded" in await page.locator("#crm-nav-status").inner_text()
        await nav.fill("games")
        assert await page.get_by_role("option", name="List of games", exact=False).count() == 1
        await page.evaluate("localStorage.removeItem('nexluck.crm.navigation.requests.v1')")
        await page.reload()
        await page.evaluate("""() => {
          localStorage.setItem('nexluck.crm.navigation.requests.v1',
            JSON.stringify([{key:'games',text:'<img src=x onerror=alert(1)>'}]));
        }""")
        await page.reload()
        assert await page.locator("#crm-nav-recent img").count() == 0
        assert "<img" in await page.locator("#crm-nav-recent .crm-nav-tag").inner_text()
        await page.emulate_media(reduced_motion="reduce")
        await page.get_by_role("button", name="Unpin navigation", exact=True).click()
        await page.locator("#crm-nav-pin").blur()
        await page.mouse.move(900, 700)
        await page.locator("#nav").blur()
        assert await page.locator(".crm-navigation").is_hidden()
        await page.locator("#sub").hover()
        assert await page.locator(".crm-navigation").is_visible()
        assert await page.locator(".crm-navigation").evaluate("e => e.getAnimations().length") == 0
        assert not errors, errors
        await browser.close()
        print("Navigation: CRM page index, phrase matching, autocomplete, keyboard, recent requests, ID routes, safe storage and mobile passed")


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="nexluck-navigation-test-") as storage:
        env = dict(os.environ, CRM_CUSTOMER_DATA_DIR=storage, CRM_CLIENT_ID="segment-test",
                   CRM_CLIENT_SECRET=secrets.token_hex(24), CRM_JWT_SECRET=secrets.token_hex(32))
        server = start(port, env)
        try:
            asyncio.run(check(f"http://127.0.0.1:{port}"))
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
