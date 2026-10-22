"""Run with repository Python Playwright: python3 cms/tests/browser_test.py."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import shutil
import time
from contextlib import contextmanager
import urllib.error
import urllib.request

from playwright.async_api import async_playwright

CMS = Path(__file__).resolve().parents[1]
ROOT = CMS.parent


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@contextmanager
def browser_files():
    path = CMS / "tests" / ".browser-fixture"
    path.mkdir()
    previous = os.environ.get("TMPDIR")
    os.environ["TMPDIR"] = str(path)
    try:
        yield str(path)
    finally:
        if previous is None:
            os.environ.pop("TMPDIR", None)
        else:
            os.environ["TMPDIR"] = previous
        shutil.rmtree(path)


def start_fixture(port, env, directory):
    web = Path(directory) / "web"
    web.mkdir()
    for name in ("crm", "h", "deposit", "localization"):
        shutil.copytree(ROOT / name, web / name, symlinks=True)
    for name in ("styles.css", "landing.css", "dropdowns.css", "index.html"):
        shutil.copy2(ROOT / name, web / name)
    # Customer data sits outside this copied web root, never beside live data.
    process = subprocess.Popen(["ruby", "crm/api/server.rb", str(port)], cwd=web, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError(process.stderr.read().decode())
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/crm/ui-api/v1/casinos", timeout=1).close()
            return process
        except urllib.error.URLError:
            time.sleep(.05)
    process.terminate()
    process.wait(timeout=10)
    raise RuntimeError("Isolated CRM fixture did not become ready")


async def browser_check(base, password):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda dialog: dialog.accept())
        # The actual CRM selector preference carries into CMS login and UI.
        await page.goto(base + "/crm/")
        await page.get_by_label("UI language", exact=True).select_option("ru")
        await page.wait_for_function("document.documentElement.lang === 'ru'")
        await page.goto(base + "/cms/")
        await page.get_by_role("heading", name="Войти в CMS", exact=True).wait_for()
        await page.locator('[name="username"]').fill("cms-browser")
        await page.locator('[name="password"]').fill("incorrect-browser-password")
        await page.get_by_role("button", name="Войти", exact=True).click()
        await page.locator(".errorlist").wait_for()
        assert "Please enter" not in await page.locator(".errorlist").inner_text()
        assert any("а" <= letter.lower() <= "я" for letter in await page.locator(".errorlist").inner_text())
        await page.locator('[name="password"]').fill(password)
        await page.get_by_role("button", name="Войти", exact=True).click()
        await page.get_by_role("heading", name="Визуальный редактор страниц", exact=True).wait_for()
        await page.get_by_label("Язык интерфейса", exact=True).select_option("en")
        await page.get_by_role("heading", name="Visual page editor", exact=True).wait_for()
        # The management-language selector accepts each new CMS locale and
        # preserves its explicit locale code across the page reload.
        for locale in ("pt-PT", "pt-BR", "es", "en"):
            await page.locator("[data-language-selector]").select_option(locale)
            await page.wait_for_function("(locale) => document.documentElement.lang === locale", arg=locale)
            assert await page.locator("[data-language-selector]").input_value() == locale
        # Exercise logout/login through the proxy, session cookies and CSRF.
        await page.get_by_role("button", name="Sign out", exact=True).click()
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
        await public.route("**/widgets/games-3/**", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"detail":"CRM temporarily unavailable"}'))
        await public.reload()
        await public.get_by_role("alert").filter(has_text="CRM temporarily unavailable").wait_for()
        await public.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await public.unroute("**/widgets/games-3/**")
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
        # The localized API reference has executable GET endpoint documentation.
        docs = await page.context.new_page()
        await docs.goto(base + "/cms/api/")
        await docs.locator(".api-endpoint").first.wait_for()
        assert await docs.locator(".api-endpoint").count() == 3
        await docs.locator(".api-endpoint").first.get_by_role("button", name="Try request", exact=True).click()
        await docs.locator(".api-endpoint").first.get_by_role("status").filter(has_text='"items"').wait_for()
        await docs.get_by_role("link", name="Swagger UI", exact=True).click()
        await docs.locator(".swagger-ui .opblock").first.wait_for()
        assert await docs.locator(".opblock").count() == 3
        await docs.get_by_role("button", name="Authorize", exact=True).wait_for()
        modules_endpoint = docs.locator(".opblock").filter(has=docs.locator('[data-path="/modules/"]'))
        await modules_endpoint.locator(".opblock-summary").click()
        await modules_endpoint.get_by_role("button", name="Try it out", exact=True).click()
        await modules_endpoint.get_by_role("button", name="Execute", exact=True).click()
        await modules_endpoint.locator(".responses-wrapper").filter(has_text='"items"').wait_for()
        assert "200" in await modules_endpoint.locator(".responses-wrapper").inner_text()
        bonuses_endpoint = docs.locator(".opblock").filter(has=docs.locator('[data-path="/get_promotion_bonuses/"]'))
        await bonuses_endpoint.locator(".opblock-summary").click()
        await bonuses_endpoint.get_by_role("tab", name="Schema", exact=True).click()
        await bonuses_endpoint.locator(".model-box").filter(has_text="external_id").wait_for()
        await docs.get_by_role("link", name="Localized API reference", exact=True).click()
        await docs.locator(".api-endpoint").first.wait_for()
        await docs.close()
        # Content language is independent of management UI language and persists.
        widget_requests = []
        public.on("request", lambda request: widget_requests.append(request.url)
                  if "/widgets/games-3/" in request.url else None)
        await page.locator('[data-module-key="games-3"]').click(button="right")
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await page.get_by_label("Localization", exact=True).select_option("pt-BR")
        await page.get_by_label("Module heading", exact=True).fill("Jogos brasileiros")
        await preview.get_by_role("heading", name="Jogos brasileiros", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("pt-PT")
        await page.get_by_label("Module heading", exact=True).fill("Jogos portugueses")
        await preview.get_by_role("heading", name="Jogos portugueses", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("es")
        await page.get_by_label("Module heading", exact=True).fill("Juegos españoles")
        await preview.get_by_role("heading", name="Juegos españoles", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("ru")
        await page.get_by_label("Module heading", exact=True).fill("Русские игры")
        await preview.get_by_role("heading", name="Русские игры", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("pt-BR")
        assert await page.get_by_label("Module heading", exact=True).input_value() == "Jogos brasileiros"
        await page.get_by_role("button", name="Reset Portuguese (Brazil) overrides", exact=True).click()
        await preview.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("es")
        assert await page.get_by_label("Module heading", exact=True).input_value() == "Juegos españoles"
        await page.get_by_role("button", name="Reset Spanish (Spain) overrides", exact=True).click()
        await preview.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await page.get_by_label("Localization", exact=True).select_option("pt-PT")
        assert await page.get_by_label("Module heading", exact=True).input_value() == "Jogos portugueses"
        await page.get_by_label("Localization", exact=True).select_option("ru")
        assert await page.get_by_label("Module heading", exact=True).input_value() == "Русские игры"
        await preview.get_by_role("heading", name="Русские игры", exact=True).wait_for()
        await preview.get_by_role("searchbox", name="Поиск игр", exact=True).wait_for()
        await page.get_by_role("button", name="Done", exact=True).click()
        await page.locator('[data-module-key="seo-default"]').click(button="right")
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        await page.get_by_label("SEO HTML", exact=True).fill('<h2>Русская SEO информация</h2><p onclick="evil()">Безопасный текст</p><script>evil()</script>')
        await page.get_by_role("button", name="Done", exact=True).click()
        await preview.get_by_role("heading", name="Русская SEO информация", exact=True).wait_for()
        assert await preview.locator(".seo-content [onclick],.seo-content script").count() == 0
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision").wait_for()
        await public.goto(base + published_url + "?lang=ru")
        await public.get_by_role("heading", name="Русские игры", exact=True).wait_for()
        await public.get_by_role("heading", name="Русская SEO информация", exact=True).wait_for()
        assert await public.locator(".seo-content [onclick],.seo-content script").count() == 0
        await public.locator("#games-3 .catalog-card").first.wait_for()
        assert await public.locator("html").get_attribute("lang") == "ru"
        await public.locator("#website-language").select_option("pt-PT")
        await public.wait_for_url("**lang=pt-PT")
        await public.get_by_role("heading", name="Jogos portugueses", exact=True).wait_for()
        assert await public.locator("html").get_attribute("lang") == "pt-PT"
        await public.locator("#games-3 .catalog-card").first.wait_for()
        assert any("lang=pt-PT" in request for request in widget_requests), widget_requests
        await public.locator("#website-language").select_option("pt-BR")
        await public.wait_for_url("**lang=pt-BR")
        await public.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        assert await public.locator("html").get_attribute("lang") == "pt-BR"
        await public.locator("#games-3 .catalog-card").first.wait_for()
        assert any("lang=pt-BR" in request for request in widget_requests), widget_requests
        await public.locator("#website-language").select_option("es")
        await public.wait_for_url("**lang=es")
        assert await public.locator("html").get_attribute("lang") == "es"
        await public.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await public.locator("#games-3 .catalog-card").first.wait_for()
        assert any("lang=es" in request for request in widget_requests), widget_requests
        await public.locator("#website-language").select_option("ru")
        await public.wait_for_url("**lang=ru")
        await public.locator("#website-language").select_option("en")
        await public.wait_for_url("**lang=en")
        await public.get_by_role("heading", name="Private new heading", exact=True).wait_for()
        await public.get_by_role("heading", name="Searchable casino information", exact=True).wait_for()
        await page.get_by_label("UI language", exact=True).select_option("ru")
        await page.get_by_role("heading", name="Визуальный редактор страниц", exact=True).wait_for()
        await page.locator('[data-module-key="games-3"]').click(button="right")
        await page.get_by_role("menuitem", name="Свойства ...", exact=True).click()
        await page.get_by_label("Локализация", exact=True).select_option("ru")
        assert await page.get_by_label("Заголовок модуля", exact=True).input_value() == "Русские игры"
        await page.get_by_label("Максимум элементов", exact=True).fill("0")
        await page.get_by_role("button", name="Готово", exact=True).click()
        await page.get_by_role("button", name="Сохранить черновик и предпросмотр", exact=True).click()
        await page.locator(".error-panel").filter(has_text="больше либо равно").first.wait_for()
        await page.locator('[data-module-key="games-3"]').click(button="right")
        await page.get_by_role("menuitem", name="Свойства ...", exact=True).click()
        await page.get_by_label("Максимум элементов", exact=True).fill("3")
        await page.get_by_role("button", name="Готово", exact=True).click()
        await page.get_by_role("button", name="Сохранить черновик и предпросмотр", exact=True).click()
        await page.get_by_role("status").filter(has_text="Черновик сохранён").wait_for()
        await page.get_by_label("Язык интерфейса", exact=True).select_option("en")
        await page.get_by_role("heading", name="Visual page editor", exact=True).wait_for()
        dialogs = []
        collect_dialog = lambda dialog: dialogs.append(dialog.type)
        page.on("dialog", collect_dialog)
        await page.get_by_label("Page title", exact=True).fill("Unsaved language guard")
        await page.get_by_label("UI language", exact=True).select_option("ru")
        await page.get_by_role("heading", name="Визуальный редактор страниц", exact=True).wait_for()
        assert dialogs == ["confirm"], dialogs
        page.remove_listener("dialog", collect_dialog)
        await page.get_by_label("Язык интерфейса", exact=True).select_option("en")
        await page.get_by_role("heading", name="Visual page editor", exact=True).wait_for()
        for width in [320, 768, 1440]:
            await page.set_viewport_size({"width": width, "height": 900})
            assert await page.evaluate("document.documentElement.scrollWidth<=innerWidth"), (
                width, await page.evaluate("""() => [...document.querySelectorAll('body *')]
                  .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
                  .slice(0, 8).map(e => [e.tagName, e.className, e.getBoundingClientRect().right])"""))
            await public.set_viewport_size({"width": width, "height": 900})
            assert await public.evaluate("document.documentElement.scrollWidth<=innerWidth"), (
                width, await public.evaluate("""() => [...document.querySelectorAll('body *')]
                  .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
                  .slice(0, 8).map(e => [e.tagName, e.className, e.getBoundingClientRect().right])"""))
        await page.get_by_role("button", name="Sign out", exact=True).click()
        await page.get_by_role("heading", name="Sign in to CMS", exact=True).wait_for()
        assert not errors, errors
        await browser.close()
        print("CMS browser: login/CSRF, API-driven properties, segment picker, hide/show, ordering, safe SEO, API reference, hydration, publication isolation, five-language UI and persisted content, language switchers, no-JS SSR, retries and responsive views passed")


def main():
    if not (CMS / "frontend/dist/editor.js").exists():
        raise SystemExit("Build frontend first: cd cms/frontend && npm ci && npm run build")
    crm_port, cms_port = free_port(), free_port()
    with browser_files() as temp:
        password = secrets.token_urlsafe(24)
        env = dict(os.environ, CMS_ENV="local", CMS_SQLITE_PATH=str(Path(temp) / "cms.sqlite3"),
                   CRM_DEMO_UI="1", CRM_API_BASE=f"http://127.0.0.1:{crm_port}/crm/api/v1",
                   CRM_CUSTOMER_DATA_DIR=str(Path(temp) / "crm"),
                   CMS_UPSTREAM=f"http://127.0.0.1:{cms_port}",
                   CRM_CLIENT_SECRET=secrets.token_hex(32), CRM_JWT_SECRET=secrets.token_hex(32),
                   CMS_BROWSER_PASSWORD=password)
        crm = start_fixture(crm_port, env, temp)
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
