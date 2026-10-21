"""Run with python3 crm/api/test/casino_browser_test.py (Playwright + Chrome)."""
import asyncio
import os
from pathlib import Path
import secrets
import socket
import tempfile

from playwright.async_api import async_playwright
from segment_browser_test import request, start, token


async def check_browser(base):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/")
        await page.locator('a[href="/crm/c/l/"]').click()
        await page.locator("tr[data-website-id]").first.wait_for()
        assert await page.locator("tr[data-website-id]").count() == 5
        assert await page.title() == "NexLuck CRM — My Casinos"
        assert await page.evaluate("crmNavigationMatches('casino websites')[0].href") == "/crm/c/l/"
        await page.get_by_role("button", name="Add new web-site", exact=True).click()
        editor = page.get_by_role("dialog", name="Add new web-site", exact=True)
        await editor.get_by_label("Name", exact=True).fill("Test Aurora Casino")
        await editor.get_by_label("URL", exact=True).fill("https://aurora.example")
        for skin in ["classic", "modern", "dark"]:
            await editor.get_by_label("Theme", exact=True).select_option(skin)
            await editor.get_by_role("img", name=skin + " website skin preview", exact=True).wait_for()
        await editor.get_by_role("button", name="Add web-site", exact=True).click()
        await editor.wait_for(state="hidden")
        row = page.locator("tr[data-website-id]").filter(has_text="Test Aurora Casino")
        assert await row.count() == 1
        created = await row.locator("time").first.get_attribute("datetime")
        assert await row.get_by_role("link", name="https://aurora.example", exact=True).get_attribute("rel") == "noopener noreferrer"
        await row.click(button="right")
        await page.get_by_role("menuitem", name="Disable", exact=True).click()
        await row.get_by_text("Disabled", exact=True).wait_for()
        assert "casino-disabled" in await row.get_attribute("class")
        await row.focus()
        await row.press("Shift+F10")
        await page.get_by_role("menuitem", name="Enable", exact=True).wait_for()
        await page.keyboard.press("Escape")
        assert await page.get_by_role("menu").count() == 0
        assert await row.evaluate("e=>e===document.activeElement")
        assert await row.get_by_role("link", name="CMS edit Test Aurora Casino", exact=True).get_attribute("href") == "/cms/?crm_site=" + await row.get_attribute("data-website-id")
        await row.get_by_role("button", name="Website settings Test Aurora Casino", exact=True).click()
        editor = page.get_by_role("dialog", name="CMS settings: Test Aurora Casino", exact=True)
        await editor.get_by_label("Name", exact=True).fill("Aurora Updated")
        await editor.get_by_label("URL", exact=True).fill("https://aurora.example/play")
        await editor.get_by_label("Theme", exact=True).select_option("modern")
        await editor.get_by_role("button", name="Save settings", exact=True).click()
        await editor.wait_for(state="hidden")
        row = page.locator("tr[data-website-id]").filter(has_text="Aurora Updated")
        await page.reload()
        await row.get_by_text("Disabled", exact=True).wait_for()
        assert await row.locator("time").first.get_attribute("datetime") == created
        # Failed mutations must not look successful or change the persisted row.
        await page.route("**/crm/ui-api/v1/casinos/*", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Status service unavailable"}'))
        await row.get_by_role("button", name="Actions for Aurora Updated", exact=True).click()
        await page.get_by_role("menuitem", name="Enable", exact=True).click()
        await page.get_by_role("alert").filter(has_text="Status service unavailable").wait_for()
        assert await row.get_by_text("Disabled", exact=True).is_visible()
        await page.unroute("**/crm/ui-api/v1/casinos/*")
        await row.get_by_role("button", name="Actions for Aurora Updated", exact=True).click()
        await page.get_by_role("menuitem", name="Enable", exact=True).click()
        await row.get_by_text("Enabled", exact=True).wait_for()
        await page.get_by_role("button", name="Add new web-site", exact=True).click()
        editor = page.get_by_role("dialog", name="Add new web-site", exact=True)
        await editor.get_by_label("Name", exact=True).fill("Second Casino")
        await editor.get_by_label("URL", exact=True).fill("https://second.example")
        await page.route("**/crm/ui-api/v1/casinos", lambda route: route.fulfill(
            status=422, content_type="application/json", body='{"error":"Validation failed","fields":{"name":"Try another name"}}'))
        await editor.get_by_role("button", name="Add web-site", exact=True).click()
        await editor.get_by_role("alert").filter(has_text="Try another name").wait_for()
        assert await page.locator("tr[data-website-id]").count() == 6
        await page.unroute("**/crm/ui-api/v1/casinos")
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await editor.evaluate("e=>e.scrollWidth<=e.clientWidth && e.getBoundingClientRect().right<=innerWidth")
        await editor.get_by_role("button", name="Add web-site", exact=True).click()
        await editor.wait_for(state="hidden")
        assert await page.locator("tr[data-website-id]").count() == 7
        await page.set_viewport_size({"width": 320, "height": 896})
        assert await page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        await row.get_by_role("button", name="Actions for Aurora Updated", exact=True).click()
        assert await page.get_by_role("menu").evaluate("e=>e.getBoundingClientRect().right<=innerWidth && e.getBoundingClientRect().bottom<=innerHeight")
        await page.keyboard.press("Escape")
        await page.route("**/crm/ui-api/v1/casinos", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Websites unavailable"}'))
        await page.reload()
        await page.get_by_role("alert").filter(has_text="Websites unavailable").wait_for()
        assert await page.get_by_text("No casino websites yet. Add your first web-site.", exact=True).count() == 0
        await page.unroute("**/crm/ui-api/v1/casinos")
        await page.get_by_role("button", name="Retry", exact=True).click()
        await page.locator("tr[data-website-id]").first.wait_for()
        assert await page.locator("tr[data-website-id]").count() == 7
        await page.goto(base + "/crm/section.html?s=casinos")
        await page.wait_for_url("**/crm/c/l/")
        await page.locator("tr[data-website-id]").first.wait_for()
        assert not errors, errors
        await browser.close()


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="nexluck-casinos-test-") as storage:
        env = dict(os.environ, CRM_CUSTOMER_DATA_DIR=storage, CRM_CLIENT_ID="segment-test",
                   CRM_CLIENT_SECRET=secrets.token_hex(24), CRM_JWT_SECRET=secrets.token_hex(32))
        server = start(port, env)
        try:
            status, seeded = request(base, "/crm/ui-api/v1/casinos")
            assert status == 200 and seeded["total"] == 5
            assert len({site["name"] for site in seeded["items"]}) == 5
            assert len({site["url"] for site in seeded["items"]}) == 5
            assert {site["theme"] for site in seeded["items"]} == {"classic", "modern", "dark"}
            assert all(site["url"].endswith(".example") for site in seeded["items"])
            assert request(base, "/crm/api/v1/casinos")[0] == 401
            read_token = token(base, env, "casinos:read")
            write_token = token(base, env, "casinos:write")
            assert request(base, "/crm/api/v1/casinos", token=read_token)[0] == 200
            assert request(base, "/crm/api/v1/casinos", "POST", {}, read_token)[0] == 403
            assert request(base, "/crm/api/v1/casinos", token=write_token)[0] == 403
            body = {"name": "Test", "url": "https://test.example", "theme": "classic"}
            for patch in [
                {"name": " "}, {"name": "a" * 121}, {"name": []},
                {"url": "javascript:alert(1)"}, {"url": "ftp://test.example"},
                {"url": "https://user:pass@test.example"}, {"url": "/relative"},
                {"url": "https://bad host"}, {"url": None}, {"theme": "unknown"},
                {"enabled": "false"}, {"id": "CS-forged"}, {"created_at": "forged"}
            ]:
                status, result = request(base, "/crm/api/v1/casinos", "POST", {**body, **patch}, write_token)
                assert status == 422 and result["fields"], (patch, status, result)
            assert request(base, "/crm/ui-api/v1/casinos", "POST", [body])[0] == 400
            assert request(base, "/crm/ui-api/v1/casinos", "DELETE")[0] == 405
            assert request(base, "/crm/ui-api/v1/casinos/CS-0000000000000000")[0] == 404
            # Verify seeds and edits survive restarts without duplicate seeds.
            status, website = request(base, "/crm/api/v1/casinos", "POST", body, write_token)
            assert status == 201 and website["enabled"] is True
            site_path = "/crm/api/v1/casinos/" + website["id"]
            status, disabled = request(base, site_path, "PATCH", {"enabled": False}, write_token)
            assert status == 200 and disabled["enabled"] is False
            assert disabled["created_at"] == website["created_at"]
            assert request(base, site_path, "PATCH", {"theme": "bad"}, write_token)[0] == 422
            assert request(base, site_path, token=read_token) == (200, disabled)
            server.terminate()
            server.wait(timeout=10)
            server = start(port, env)
            assert request(base, "/crm/ui-api/v1/casinos/" + website["id"]) == (200, disabled)
            assert request(base, "/crm/ui-api/v1/casinos")[1]["total"] == 6
            server.terminate()
            server.wait(timeout=10)
            Path(storage, "casino_websites.json").write_text("[]")
            server = start(port, env)
            asyncio.run(check_browser(base))
            before = request(base, "/crm/ui-api/v1/casinos")
            assert before[1]["total"] == 7
            assert Path(storage, "casino_websites.json").stat().st_mode & 0o777 == 0o600
            server.terminate()
            server.wait(timeout=10)
            server = start(port, env)
            assert request(base, "/crm/ui-api/v1/casinos") == before
            print("Casinos: create/edit, skins, disable/enable, menus/keyboard, validation, scopes, persistence, failures, mobile, Home and legacy navigation passed")
        finally:
            if server.poll() is None:
                server.terminate()
                server.wait(timeout=10)


if __name__ == "__main__":
    main()
