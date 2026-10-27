"""Run: python3 cms/tests/popular_browser_test.py (isolated CRM and CMS stores)."""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

from playwright.async_api import async_playwright
import browser_test as harness


async def check(base, password):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if "CMS widget hydration failed" in message.text else None)
        page.on("dialog", lambda dialog: dialog.accept())
        await page.goto(base + "/cms/")
        await page.locator('[name="username"]').fill("cms-browser")
        await page.locator('[name="password"]').fill(password)
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.get_by_role("heading", name="Visual page editor", exact=True).wait_for()
        preview = page.frame_locator('iframe[title="Page preview"]')
        await preview.locator("#games-3 .popular-tile").first.wait_for()
        assert await preview.locator("#games-3 .popular-tile").count() == 10
        assert await preview.locator("#games-3 .popular-track").evaluate("e => e.scrollWidth > e.clientWidth")
        assert await preview.locator("#games-3 .popular-favourite").count() == 0
        toolbar = page.locator(".preview-toolbar")
        assert await toolbar.get_by_label("Viewport", exact=True).count() == 1
        assert await toolbar.get_by_text("Viewport", exact=True).count() == 0
        assert await toolbar.get_by_label("Demo country", exact=True).count() == 1
        assert await toolbar.get_by_text("Saved draft · right-click a module to edit", exact=True).count() == 0
        assert await toolbar.evaluate("e => getComputedStyle(e).justifyContent") == "center"
        assert await toolbar.evaluate("e => getComputedStyle(e).alignItems") == "center"
        await toolbar.get_by_label("Viewport", exact=True).select_option("mobile")
        await toolbar.get_by_label("Demo country", exact=True).select_option("PL")
        assert await page.get_by_label("Demo signed-in player", exact=True).count() == 0
        assert await page.locator(".popular-demo-controls").count() == 0
        await preview.locator("#games-3 .eyebrow").filter(has_text="POLAND").wait_for()
        first_id = await preview.locator("#games-3 .popular-tile").first.get_attribute("data-game-id")
        await page.locator('[data-module-key="games-3"]').click(button="right")
        await page.get_by_role("menuitem", name="Properties ...", exact=True).click()
        dialog = page.get_by_role("dialog")
        await dialog.get_by_label("Layout", exact=True).select_option("double")
        assert await dialog.get_by_label("Home limit", exact=True).input_value() == "20"
        await preview.locator("#games-3 .popular-double .popular-tile").nth(19).wait_for()
        assert await preview.locator("#games-3 .popular-tile small").count() == 0
        assert await preview.locator("#games-3 .popular-track").evaluate("e=>getComputedStyle(e).gridTemplateRows.split(' ').length") == 2
        await dialog.get_by_label("Mode", exact=True).select_option("manual")
        picker = dialog.locator(".popular-picker")
        await picker.get_by_label("Add game", exact=True).locator("option").nth(1).wait_for(state="attached")
        await picker.get_by_label("Add game", exact=True).select_option(index=1)
        await picker.get_by_role("button", name="Add", exact=True).click()
        await picker.get_by_label("Add game", exact=True).select_option(index=1)
        await picker.get_by_role("button", name="Add", exact=True).click()
        assert await picker.locator("li").count() == 2
        names = await picker.locator("li > span").all_text_contents()
        await picker.locator("li").last.get_by_role("button", name="Move", exact=False).first.click()
        assert await picker.locator("li > span").all_text_contents() == list(reversed(names))
        await dialog.get_by_label("Localization", exact=True).select_option("ru")
        await dialog.get_by_label("Module heading", exact=True).fill("RU Popular")
        await dialog.get_by_label("Home limit", exact=True).fill("1")
        await preview.get_by_role("heading", name="RU Popular", exact=True).wait_for()
        await preview.locator("#games-3 .popular-tile").first.wait_for()
        assert await preview.locator("#games-3 .popular-tile").count() == 1
        await dialog.get_by_label("Localization", exact=True).select_option("en")
        assert await dialog.get_by_label("Home limit", exact=True).input_value() == "20"
        await dialog.get_by_label("Mode", exact=True).select_option("hybrid")
        picker = dialog.locator(".popular-picker")
        await picker.get_by_label("Add game", exact=True).select_option(first_id)
        await picker.get_by_role("button", name="Add", exact=True).click()
        await picker.get_by_role("spinbutton").fill("3")
        await preview.locator("#games-3 .popular-tile").nth(2).wait_for()
        await page.wait_for_function("""id => document.querySelector('iframe').contentDocument
            .querySelectorAll('#games-3 .popular-tile')[2]?.dataset.gameId === id""", arg=first_id)
        await dialog.get_by_label("Page limit", exact=True).fill("25")
        await dialog.get_by_label("Ranking period (minutes)", exact=True).fill("4320")
        await dialog.get_by_label("Mode", exact=True).select_option("ai")
        await dialog.get_by_role("button", name="Done", exact=True).click()
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision").wait_for()
        published_url = await page.get_by_role("link", name="Open published site", exact=False).get_attribute("href")
        public = await context.new_page()
        public.on("pageerror", lambda error: errors.append(str(error)))
        public.on("console", lambda message: errors.append(message.text) if "CMS widget hydration failed" in message.text else None)
        await public.goto(base + published_url + "?demo_country=BR&demo_player=1")
        await public.locator("#games-3 .popular-tile").nth(19).wait_for()
        await public.get_by_role("link", name="View all →", exact=True).click()
        await public.locator(".popular-podium .popular-tile").nth(2).wait_for()
        assert await public.locator(".popular-list-item").count() == 22
        assert await public.locator(".popular-position").all_text_contents() == [str(i).zfill(2) for i in range(1, 26)]
        assert "over the last 3 days" in await public.locator(".popular-subtitle").inner_text()
        assert "Brazil" in await public.locator(".popular-subtitle").inner_text()
        assert "Sorted to your taste" in await public.locator(".popular-subtitle").inner_text()
        await public.locator('.popular-tile').nth(2).locator('.popular-favourite').click()
        await public.locator('.popular-tile').nth(2).locator('[aria-pressed="true"]').wait_for()
        assert await public.locator(".popular-list-item small").count() == 22
        await public.get_by_role("button", name="Search", exact=True).click()
        assert await public.get_by_role("searchbox", name="Search games", exact=True).evaluate("e => e === document.activeElement")
        await public.get_by_role("searchbox", name="Search games", exact=True).fill("unmatched game title")
        assert await public.locator(".popular-tile:visible").count() == 0
        await public.get_by_role("searchbox", name="Search games", exact=True).fill("")
        # A successful first order must stay fixed without polling.
        before = await public.locator(".popular-tile").evaluate_all("nodes=>nodes.map(n=>n.dataset.gameId)")
        await public.wait_for_timeout(1200)
        assert before == await public.locator(".popular-tile").evaluate_all("nodes=>nodes.map(n=>n.dataset.gameId)")
        for width in (320, 390, 768):
            await public.set_viewport_size({"width": width, "height": 844})
            assert await public.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await public.set_viewport_size({"width": 390, "height": 844})
        if os.environ.get("POPULAR_SCREENSHOT"):
            await public.screenshot(path=os.environ["POPULAR_SCREENSHOT"], full_page=True)
        async def live_worldwide(route):
            response = await route.fetch()
            body = await response.json()
            body["ranking"].update(country="WORLD", countryName=None, period={"minutes": 60},
                                   updatedAt=(datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat())
            body["stale"] = True
            await route.fulfill(response=response, json=body)
        await public.route("**/widgets/games-3/**", live_worldwide)
        await public.reload()
        await public.locator(".popular-subtitle").filter(has_text="across all countries right now (last 60 min), updated 5 min ago").wait_for()
        await public.get_by_text("Showing saved ranking.", exact=True).wait_for()
        await public.unroute("**/widgets/games-3/**")
        # Skeletons, explicit empty/error states and a functioning catalogue escape.
        await public.route("**/widgets/games-3/**", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"detail":"Ranking unavailable"}'))
        await public.reload()
        await public.get_by_role("alert").filter(has_text="Games didn't load").wait_for()
        await public.unroute("**/widgets/games-3/**")
        await public.get_by_role("button", name="Try again", exact=True).click()
        await public.locator(".popular-list-item").first.wait_for()
        await public.route("**/widgets/games-3/**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps({"items": []})))
        await public.reload()
        await public.get_by_text("No games here yet", exact=True).wait_for()
        await public.unroute("**/widgets/games-3/**")
        await public.get_by_role("link", name="Browse all games", exact=True).click()
        await public.locator(".popular-podium .popular-tile").first.wait_for()
        assert "browse=1" in public.url
        assert not errors, errors
        await browser.close()
        print("Popular browser: editor, row/double, locale overrides, manual order, pins, favourites, full list, periods, empty/error/retry and mobile passed.")


if __name__ == "__main__":
    harness.browser_check = check
    harness.main()
