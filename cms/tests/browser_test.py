"""Run with repository Python Playwright: python3 cms/tests/browser_test.py."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from playwright.async_api import async_playwright

CMS = Path(__file__).resolve().parents[1]
ROOT = CMS.parent
sys.path.insert(0, str(ROOT / "crm/api/test"))
from segment_browser_test import start


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def browser_check(base, password):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda dialog: dialog.accept())
        # Exercise the actual Ruby proxy, session cookies and CSRF roundtrip.
        await page.goto(base + "/cms/")
        await page.get_by_label("Username:", exact=True).fill("cms-browser")
        await page.get_by_label("Password:", exact=True).fill(password)
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.get_by_role("heading", name="Visual page editor", exact=True).wait_for()
        await page.get_by_label("Website", exact=True).select_option(index=1)
        preview = page.frame_locator('iframe[title="Page preview"]')
        await preview.get_by_role("heading", name="Popular games", exact=True).wait_for()
        await preview.locator("#games-3 .catalog-card").first.wait_for()
        assert await preview.locator("#games-3 .catalog-card").count() == 8
        assert await page.get_by_text("Selected module", exact=True).count() == 0
        assert await preview.get_by_text("Edit section", exact=True).count() == 0
        assert await page.get_by_role("button", name="Connect CRM website", exact=True).count() == 0
        assert await page.get_by_role("link", name="Back to CRM", exact=True).is_visible()
        assert await preview.locator(".home-header-actions .profile-avatar").count() == 1
        assert await preview.locator(".landing-bottom-nav button").count() == 4
        assert await page.get_by_label("Layout", exact=True).locator("option:checked").inner_text() == "NexLuck Demo Layout"
        async def check_dropdown_insets(scope):
            controls = scope.locator('select:not([multiple]):not([size]),select[size="1"]')
            await controls.first.wait_for()
            assert await controls.count() > 0
            for control in await controls.all():
                geometry = await control.evaluate("""e => {
                  const s = getComputedStyle(e);
                  return { appearance: s.appearance, left: s.paddingLeft,
                    right: s.backgroundPositionX, image: s.backgroundImage };
                }""")
                assert geometry["appearance"] == "none", geometry
                assert geometry["right"] == f'calc(100% - {geometry["left"]})', geometry
                assert geometry["image"] != "none", geometry
        await check_dropdown_insets(page)
        await check_dropdown_insets(preview)
        source_page = await context.new_page()
        source_page.on("pageerror", lambda error: errors.append(str(error)))
        await source_page.goto(base + "/h/")
        await source_page.locator("#home-promo-track .home-feature-card").first.wait_for()
        for selector in [".home-header", ".home-feature-card", ".landing-bottom-nav"]:
            style = "(e)=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderRadius,s.fontFamily]}"
            assert await source_page.locator(selector).first.evaluate(style) == await preview.locator(selector).first.evaluate(style)
        await source_page.close()
        assert await preview.locator("#games-3").evaluate("(e)=>getComputedStyle(e).outlineOffset") == "7px"
        # Properties come from the module API and open through the preview context menu.
        await preview.locator("#games-3").click(button="right", position={"x": 20, "y": 20})
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await check_dropdown_insets(page.get_by_role("dialog"))
        await page.get_by_label("Module heading", exact=True).fill("Unsaved game heading")
        await preview.get_by_role("heading", name="Unsaved game heading", exact=True).wait_for()
        assert await page.get_by_text("Unsaved changes", exact=True).is_visible()
        assert await page.get_by_role("button", name="Publish", exact=True).is_disabled()
        # Unsaved previews use their own parameters, not the stored draft's.
        await page.get_by_label("Maximum items", exact=True).fill("3")
        await preview.locator("#games-3 .catalog-card").nth(2).wait_for()
        await page.wait_for_function("""() => {
          const frame=document.querySelector('iframe');
          return frame?.contentDocument?.querySelectorAll('#games-3 .catalog-card').length===3;
        }""")
        await page.get_by_role("button", name="Done", exact=True).click()
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision 2").wait_for()
        published_url = await page.get_by_role("link", name="Open published site", exact=False).get_attribute("href")
        public = await browser.new_page()
        await public.goto(base + published_url)
        await public.get_by_role("heading", name="Unsaved game heading", exact=True).wait_for()
        await public.locator("#games-3 .catalog-card").first.wait_for()
        assert await public.locator("#games-3 .catalog-card").count() == 3
        # Draft changes do not modify published SSR.
        await preview.locator("#games-3").click(button="right", position={"x": 20, "y": 20})
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await page.get_by_label("Module heading", exact=True).fill("Private new heading")
        await preview.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await page.get_by_role("button", name="Done", exact=True).click()
        await public.reload()
        await public.get_by_role("heading", name="Unsaved game heading", exact=True).wait_for()
        assert await public.get_by_role("heading", name="Private new heading", exact=True).count() == 0
        await page.get_by_label("Layout", exact=True).select_option("compact")
        await page.get_by_label("Theme", exact=True).select_option("dark")
        await preview.locator(".columns-2").wait_for()
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision 3").wait_for()
        await public.reload()
        await public.locator(".columns-2").wait_for()
        # Model-backed third-party-style plugin end-to-end.
        await page.get_by_text("Sample announcements plugin", exact=True).click()
        await page.get_by_label("Announcement title", exact=True).fill("CMS plugin works")
        await page.get_by_label("Announcement text", exact=True).fill("A database-backed async announcement.")
        await page.get_by_role("button", name="Publish announcement", exact=True).click()
        await page.get_by_role("status").filter(has_text="Public announcement added").wait_for()
        await public.reload()
        await public.get_by_role("heading", name="CMS plugin works", exact=True).wait_for()
        # Initial SSR content is readable with JavaScript disabled.
        nojs = await browser.new_context(java_script_enabled=False)
        ssr = await nojs.new_page()
        await ssr.goto(base + published_url)
        await ssr.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        assert await ssr.locator("#games-3 .catalog-card").count() == 0
        await nojs.close()
        # Independent widget failure and retry do not prevent SSR.
        await public.route("**/widgets/games-3/", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"detail":"CRM temporarily unavailable"}'))
        await public.reload()
        await public.get_by_role("alert").filter(has_text="CRM temporarily unavailable").wait_for()
        await public.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await public.unroute("**/widgets/games-3/")
        await public.get_by_role("button", name="Retry", exact=True).click()
        await public.locator("#games-3 .catalog-card").first.wait_for()
        # Actual /h navigation module interactions and external unsaved preview.
        await preview.get_by_role("button", name="Menu", exact=True).click()
        await preview.get_by_role("button", name="Close menu", exact=True).wait_for()
        await preview.get_by_role("button", name="Close menu", exact=True).click()
        await page.get_by_role("link", name="Preview", exact=False).first.wait_for()
        external_url = await page.get_by_role("link", name="Preview", exact=False).first.get_attribute("href")
        external = await page.context.new_page()
        await external.goto(base + external_url)
        await external.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        assert await external.locator("[draggable=true]").count() == 0
        await external.close()
        # API-driven promotions properties use the same CRM selection control.
        promotion_row = page.locator('[data-module-key="promotions-1"]')
        await promotion_row.click(button="right")
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await page.get_by_label("Total", exact=True).fill("4")
        await page.get_by_role("button", name="Select segments", exact=True).click()
        segments = page.get_by_role("dialog", name="Segments", exact=True)
        await segments.locator(".segment-library-item").first.wait_for()
        await segments.get_by_role("checkbox").first.check()
        assert await segments.locator(".segment-library-item.selected .segment-tag").count() == 1
        await segments.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator(".segment-property > .segment-tags .segment-tag").count() == 1
        await page.get_by_role("button", name="Done", exact=True).click()
        # Hidden modules remain grey and noninteractive in the editor, but not on the published site.
        games_row = page.locator('[data-module-key="games-3"]')
        await games_row.click(button="right")
        await page.get_by_role("menuitem", name="Hide", exact=True).click()
        await preview.locator('#games-3[data-cms-hidden="true"]').wait_for()
        await preview.locator("#games-3 .catalog-card").first.wait_for()
        assert await preview.locator("#games-3").is_visible()
        assert await preview.locator("#games-3").evaluate("e=>getComputedStyle(e).filter") == "grayscale(1)"
        assert await preview.get_by_role("searchbox", name="Search games", exact=True).is_disabled()
        assert "hidden" in await games_row.inner_text()
        assert "module-hidden" in await games_row.get_attribute("class")
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision 4").wait_for()
        await public.reload()
        assert await public.locator("#games-3").count() == 0
        await preview.locator('#games-3[data-cms-hidden="true"]').click(button="right", position={"x": 20, "y": 20})
        await page.get_by_role("menuitem", name="Show", exact=True).click()
        await preview.locator('#games-3:not([data-cms-hidden])').wait_for()
        assert await preview.get_by_role("searchbox", name="Search games", exact=True).is_enabled()
        # Native drag-and-drop changes order; Alt+Arrow is the keyboard alternative.
        source = page.locator('[data-module-key="categories-2"]')
        target = page.locator('[data-module-key="games-3"]')
        await source.drag_to(target)
        keys = await page.locator("[data-module-key]").evaluate_all("(nodes)=>nodes.map(n=>n.dataset.moduleKey)")
        assert keys.index("categories-2") > keys.index("games-3"), keys
        await source.focus()
        await source.press("Alt+ArrowUp")
        keys = await page.locator("[data-module-key]").evaluate_all("(nodes)=>nodes.map(n=>n.dataset.moduleKey)")
        assert keys.index("categories-2") < keys.index("games-3"), keys
        await preview.locator("#categories-2").drag_to(preview.locator("#games-3"))
        await page.wait_for_function("""() => {
          const keys=[...document.querySelectorAll('[data-module-key]')].map(n=>n.dataset.moduleKey);
          return keys.indexOf('categories-2')>keys.indexOf('games-3');
        }""")
        await source.focus()
        await source.press("Alt+ArrowUp")
        # SEO HTML is sanitized in the actual SSR preview.
        await page.locator('[data-module-key="seo-default"]').click(button="right")
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await page.get_by_label("SEO HTML", exact=True).fill('<h2>Searchable casino information</h2><p onclick="evil()">Safe HTML</p><script>evil()</script>')
        await page.get_by_role("button", name="Done", exact=True).click()
        await preview.get_by_role("heading", name="Searchable casino information", exact=True).wait_for()
        assert await preview.locator(".seo-content [onclick],.seo-content script").count() == 0
        # Add/remove exists only in the context menu, and module schemas supply defaults.
        await page.get_by_label("New module", exact=True).select_option("text")
        await page.get_by_role("button", name="Add module", exact=True).click()
        added = page.locator("[data-module-key]").last
        await added.click(button="right")
        await page.get_by_role("menuitem", name="Remove", exact=True).click()
        assert await page.locator("[data-module-key]").count() == 15
        # Swagger UI is self-hosted, with executable GET endpoint documentation.
        docs = await page.context.new_page()
        await docs.goto(base + "/cms/api/")
        await docs.locator(".swagger-ui .opblock").first.wait_for()
        assert await docs.locator(".opblock").count() == 3
        await docs.close()
        for width in [320, 768, 1440]:
            await page.set_viewport_size({"width": width, "height": 900})
            assert await page.evaluate("document.documentElement.scrollWidth<=innerWidth"), width
            await public.set_viewport_size({"width": width, "height": 900})
            assert await public.evaluate("document.documentElement.scrollWidth<=innerWidth"), width
        await page.get_by_role("button", name="Sign out", exact=True).click()
        await page.get_by_role("heading", name="Sign in to CMS", exact=True).wait_for()
        assert not errors, errors
        await browser.close()
        print("CMS browser: proxy login/CSRF, actual /h styles/navigation, API-driven context properties, CRM segment picker, hide/show grey disabled preview and published omission, remove, drag/drop + keyboard ordering, safe SEO HTML, external preview, Swagger UI, catalog hydration, draft/publication isolation, plugin, no-JS SSR, retries and responsive views passed")


def main():
    if not (CMS / "frontend/dist/editor.js").exists():
        raise SystemExit("Build frontend first: cd cms/frontend && npm ci && npm run build")
    crm_port, cms_port = free_port(), free_port()
    with tempfile.TemporaryDirectory(prefix="nexluck-cms-browser-") as temp:
        password = secrets.token_urlsafe(24)
        env = dict(os.environ, CMS_ENV="local", CMS_SQLITE_PATH=str(Path(temp) / "cms.sqlite3"),
                   CRM_DEMO_UI="1", CRM_API_BASE=f"http://127.0.0.1:{crm_port}/crm/api/v1",
                   CRM_CUSTOMER_DATA_DIR=str(Path(temp) / "crm"),
                   CMS_UPSTREAM=f"http://127.0.0.1:{cms_port}",
                   CRM_CLIENT_SECRET=secrets.token_hex(32), CRM_JWT_SECRET=secrets.token_hex(32),
                   CMS_BROWSER_PASSWORD=password)
        crm = start(crm_port, env)
        server = None
        try:
            for args in [
                ["migrate", "--noinput"],
                ["setup_cms", "--import-crm"],
                ["shell", "-c", "import os; from django.contrib.auth import get_user_model; get_user_model().objects.create_superuser('cms-browser', password=os.environ['CMS_BROWSER_PASSWORD'])"],
            ]:
                subprocess.run([str(CMS / ".venv/bin/python"), "manage.py", *args], cwd=CMS, env=env, check=True, stdout=subprocess.DEVNULL)
            with open(Path(temp) / "django.log", "w+") as log:
                server = subprocess.Popen([str(CMS / ".venv/bin/python"), "manage.py", "runserver", f"127.0.0.1:{cms_port}", "--noreload"],
                                          cwd=CMS, env=env, stdout=log, stderr=log)
                for _ in range(100):
                    if server.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read()[-5000:])
                    try:
                        urllib.request.urlopen(f"http://127.0.0.1:{cms_port}/cms/health/", timeout=1).close()
                        break
                    except urllib.error.URLError:
                        time.sleep(.1)
                else:
                    raise RuntimeError("CMS did not become ready")
                asyncio.run(browser_check(f"http://127.0.0.1:{crm_port}", password))
        finally:
            for process in [server, crm]:
                if process and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)


if __name__ == "__main__":
    main()
