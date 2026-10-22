"""Multilingual interface checks using an isolated CRM store and installed Chrome."""
import asyncio
import json
import urllib.error
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright
from casino_context_test import CasinoContextTests as Server

ROOT = Path(__file__).resolve().parents[3]
CATALOG = json.loads((ROOT / "localization" / "crm.json").read_text())
RU = CATALOG["ru"]


async def check():
    base = Server.base.removesuffix("/crm/ui-api/v1/")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/")
        await page.locator("#tiles .tile").first.wait_for()
        assert await page.locator("h1").inner_text() == "Operator Console"
        owner = await page.evaluate("CRMContext.id")
        language = page.locator("[data-language-selector]")
        assert await language.locator("option").all_text_contents() == ["EN", "RU", "PT", "BR", "ES"]
        assert await language.get_attribute("aria-label") == "UI language"
        assert (await language.bounding_box())["width"] <= 70
        assert await language.locator("option").evaluate_all(
            "(options) => options.every(option => option.title && option.lang)"
        )
        await page.locator("[data-language-selector]").select_option("ru")
        await page.get_by_role("heading", name="Консоль оператора", exact=True).wait_for()
        await page.locator("#tiles .tile").first.wait_for()
        assert await page.locator("html").get_attribute("lang") == "ru"
        assert await page.evaluate("CRMContext.id") == owner
        assert await page.locator('[data-section="customers"] .big small').inner_text() == RU["Demo total players"]
        assert await page.locator("[data-language-selector]").input_value() == "ru"
        assert (await page.locator("[data-language-selector]").bounding_box())["width"] <= 70
        assert any(cookie["name"] == "nexluck_language" and cookie["value"] == "ru"
                   for cookie in await page.context.cookies())
        assert await page.evaluate("crmNavigationMatches('покажи список игр')[0].key") == "games"
        assert await page.evaluate("crmNavigationMatches('открой клиентов')[0].key") == "customers"
        paths = [
            ("/crm/c/l/", "My Casinos", ".casino-table tbody tr"),
            ("/crm/b/", "🎁 Bonuses / Promotion", ".bt tbody tr"),
            ("/crm/b/e/?id=BN-1001", None, ".sat"),
            ("/crm/c/list/", "Customers", ".customer-table tbody tr"),
            ("/crm/c/i/?id=CU-1001", "Customer info", ".customer-sat"),
            ("/crm/g/", "Games", ".game-table tbody tr"),
            ("/crm/f/", "💶 Finance / Payment methods and systems", ".bt tbody tr"),
            ("/crm/f/wallets/", "▣ Player Wallets", ".bt tbody tr"),
            ("/crm/f/transactions/", "☰ Payment Transactions", ".bt tbody tr"),
            ("/crm/f/cascades/", "⇢ Payment Cascades and Routing", ".bt tbody tr"),
            ("/crm/a/", "Analytics", ".analytics-kpis"),
        ]
        for path, title, selector in paths:
            await page.goto(base + path)
            await page.locator(selector).first.wait_for()
            if title:
                assert await page.locator("h1").inner_text() == RU[title], path
            assert await page.locator("[data-language-selector]").input_value() == "ru"
        await page.get_by_role("button", name=RU["Ask AI"], exact=True).click()
        await page.get_by_role("dialog").get_by_role("textbox").fill("Покажи GGR за сегодня")
        await page.get_by_role("button", name=RU["Ask"], exact=True).click()
        await page.get_by_role("heading", name=RU["GGR result"], exact=True).wait_for()
        assert await page.get_by_role("dialog").locator(".analytics-chat-request").inner_text() == "Покажи GGR за сегодня"
        await page.get_by_role("button", name=RU["Close "] + RU["Ask AI"], exact=True).click()
        await page.goto(base + "/crm/f/transactions/")
        await page.locator(".bt tbody tr").first.wait_for()
        status = page.locator("select").filter(has=page.locator('option[value="Approved"]'))
        await status.select_option("Approved")
        assert await status.input_value() == "Approved"
        assert await page.locator(".bt tbody .st").all_text_contents() == [RU["Approved"]] * await page.locator(".bt tbody .st").count()
        await page.goto(base + "/crm/c/l/")
        await page.get_by_role("button", name=RU["Add new web-site"], exact=True).click()
        await page.get_by_role("dialog").locator("input").first.fill("Unchanged casino name")
        page.once("dialog", lambda dialog: dialog.dismiss())
        await page.locator("[data-language-selector]").select_option("en")
        assert await page.locator("[data-language-selector]").input_value() == "ru"
        assert await page.evaluate("localStorage.getItem('nexluck.ui.language')") == "ru"
        assert await page.get_by_role("dialog").locator("input").first.input_value() == "Unchanged casino name"
        page.once("dialog", lambda dialog: dialog.accept())
        await page.locator("[data-language-selector]").select_option("en")
        await page.get_by_role("heading", name="My Casinos", exact=True).wait_for()
        assert await page.locator("[data-language-selector]").input_value() == "en"
        for locale, format_locale in (("pt-PT", "pt-PT"), ("pt-BR", "pt-BR"), ("es", "es-ES")):
            messages = CATALOG[locale]
            await page.wait_for_function("window.CRMContext && CRMContext.id")
            current_owner = await page.evaluate("CRMContext.id")
            await page.locator("[data-language-selector]").select_option(locale)
            await page.get_by_role("heading", name=messages["My Casinos"], exact=True).wait_for()
            await page.wait_for_function("window.CRMContext && CRMContext.id")
            assert await page.locator("html").get_attribute("lang") == locale
            assert await page.evaluate("CRMContext.id") == current_owner
            assert await page.evaluate("localStorage.getItem('nexluck.ui.language')") == locale
            assert await page.evaluate("NexLuckI18n.formatLocale") == format_locale
            assert any(cookie["name"] == "nexluck_language" and cookie["value"] == locale
                       for cookie in await page.context.cookies())
            for path, title, selector in paths:
                await page.goto(base + path)
                await page.locator(selector).first.wait_for()
                if title:
                    assert await page.locator("h1").inner_text() == messages[title], (locale, path)
                assert await page.locator("[data-language-selector]").input_value() == locale
                assert (await page.locator("[data-language-selector]").bounding_box())["width"] <= 70
            await page.goto(base + "/crm/c/l/")
            await page.locator(".casino-table tbody tr").first.wait_for()
        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        await browser.close()


def check_api():
    for header, locale in (("ru", "ru"), ("pt-PT", "pt-PT"), ("pt-BR", "pt-BR"),
                           ("PT-br", "pt-BR"), ("pt", "pt-PT"), ("es-ES", "es"), ("fr", "en")):
        request = urllib.request.Request(Server.base + "dashboard", headers={"Accept-Language": header})
        try:
            urllib.request.urlopen(request)
        except urllib.error.HTTPError as response:
            assert response.code == 400
            assert response.headers["Content-Language"] == locale
            assert json.load(response)["error"] == CATALOG[locale]["A valid X-Casino-Id header is required"]
        else:
            raise AssertionError("Missing owner must fail in every language")
    body = {"name": "Русское имя казино", "url": "https://locale.example", "theme": "classic"}
    request = urllib.request.Request(Server.base + "casinos", data=json.dumps(body).encode(),
        headers={"Accept-Language": "ru", "Content-Type": "application/json", "Idempotency-Key": "locale-test-casino"}, method="POST")
    with urllib.request.urlopen(request) as response:
        created = json.load(response)
        assert created["name"] == body["name"]
        assert created["theme"] == "classic"


if __name__ == "__main__":
    Server.setUpClass()
    try:
        check_api()
        asyncio.run(check())
        print("CRM EN/RU/PT/BR/ES: all pages, compact selector, persisted language, unchanged enums, API errors and dirty guards passed.")
    finally:
        Server.tearDownClass()
