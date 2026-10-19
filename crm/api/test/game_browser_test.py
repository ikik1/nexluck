"""Run with python3 crm/api/test/game_browser_test.py (Playwright + Chrome)."""
import asyncio
import json
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
        assert await page.get_by_role("combobox", name="Navigate to", exact=True, include_hidden=True).count() == 1
        assert await page.locator("tr[data-game-id]").count() == 100
        assert await page.locator(".publisher-row").count() == 5
        assert await page.get_by_role("columnheader", name="Popularity /100 (demo)", exact=True).count() == 1
        assert await page.get_by_role("columnheader", name="Play count (demo)", exact=True).count() == 1
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
        slot_row = cats.locator(".game-category-row").filter(has=page.get_by_role("checkbox", name="Slots", exact=True))
        assert await slot_row.locator(".category-row-badges .segment-tag").count() >= 1
        assert await slot_row.locator(".category-row-badges .game-tag").count() >= 1
        assert await slot_row.evaluate("e => e.querySelector('.category-row-badges').getBoundingClientRect().right <= e.querySelector('.game-category-name').getBoundingClientRect().left")
        await cats.get_by_role("button", name="View games in Adventure", exact=True).click()
        for width in [1440, 414]:
            await page.set_viewport_size({"width": width, "height": 650})
            category_scroll = cats.get_by_role("region", name="Category list", exact=True)
            game_scroll = cats.get_by_role("list", name="Ordered category games", exact=True)
            assert await category_scroll.evaluate("e => e.scrollHeight > e.clientHeight")
            assert await game_scroll.evaluate("e => e.scrollHeight > e.clientHeight")
            await category_scroll.evaluate("e => e.scrollTop = 0")
            await game_scroll.evaluate("e => e.scrollTop = 0")
            await category_scroll.evaluate("e => e.scrollTop = 100")
            assert await category_scroll.evaluate("e => e.scrollTop") == 100
            assert await game_scroll.evaluate("e => e.scrollTop") == 0
            await game_scroll.evaluate("e => e.scrollTop = 100")
            assert await game_scroll.evaluate("e => e.scrollTop") == 100
            assert await category_scroll.evaluate("e => e.scrollTop") == 100
            if width == 1440:
                assert await cats.evaluate("e => e.scrollHeight <= e.clientHeight")
        await page.set_viewport_size({"width": 1440, "height": 1000})
        for name, color in [("Recent games", "rgb(11, 122, 117)"), ("Favourite games", "rgb(161, 59, 114)")]:
            dynamic = cats.locator(".game-category-row").filter(has=page.get_by_role("checkbox", name=name, exact=True))
            assert await dynamic.evaluate("e => getComputedStyle(e).borderLeftColor") == color
            assert await dynamic.get_by_role("checkbox").is_disabled()
            await cats.get_by_role("button", name="View games in " + name, exact=True).click()
            assert await cats.get_by_text("Dynamic category definition only.", exact=False).count() == 1
            assert await cats.get_by_role("button", name="Auto-sort", exact=True).count() == 0
        await cats.get_by_label("Search categories", exact=True).fill("Slots")
        await cats.get_by_role("checkbox", name="Slots", exact=True).check()
        await cats.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator("tr[data-game-id]").count() == 4
        await page.get_by_role("button", name="Remove category filter Slots", exact=True).click()
        await page.get_by_role("button", name="Game categories", exact=True).click()
        await cats.get_by_role("button", name="+ New category", exact=True).click()
        category_editor = page.get_by_role("dialog", name="New category", exact=True)
        await category_editor.get_by_label("Category name", exact=True).fill("Featured games")
        assert await category_editor.get_by_label("CMS identifier", exact=True).input_value() == "featured-games"
        await category_editor.get_by_label("CMS identifier", exact=True).fill("homepage-featured")
        assert await category_editor.get_by_role("group", name="Copy games from providers", exact=True).count() == 0
        assert await category_editor.get_by_role("group", name="Copy games from categories", exact=True).count() == 0
        assert await category_editor.get_by_label("Search available games", exact=True).count() == 0
        await category_editor.get_by_role("group", name="Tags", exact=True).get_by_role("checkbox", name="popular", exact=True).check()
        await category_editor.get_by_label("New tag", exact=True).fill("homepage")
        await category_editor.get_by_role("button", name="Add tag", exact=True).click()
        await category_editor.get_by_role("button", name="Edit category segments", exact=True).click()
        segments = page.get_by_role("dialog", name="Segments", exact=True)
        for name in ["VIP", "REGISTERED"]:
            await segments.get_by_label("Select segment " + name, exact=True).dblclick()
        await page.keyboard.press("Escape")
        await category_editor.get_by_role("button", name="Save category", exact=True).click()
        await category_editor.wait_for(state="hidden")
        assert await cats.locator("[data-category-game-id]").count() == 0
        await cats.get_by_role("button", name="Add games", exact=True).click()
        assert await cats.locator(".category-add-games").evaluate("e => parseFloat(getComputedStyle(e).marginBottom) >= 16 && parseFloat(getComputedStyle(e).marginTop) >= 16")
        picker = page.get_by_role("dialog", name="Add games", exact=True)
        await picker.wait_for()
        await page.wait_for_timeout(250)
        assert await picker.evaluate("e => Math.abs(e.getBoundingClientRect().right - innerWidth) < 1")
        await picker.get_by_label("Search games to add", exact=True).fill("not-a-game")
        assert await picker.get_by_text("No games match this search.", exact=True).count() == 1
        await picker.get_by_label("Search games to add", exact=True).fill("Gates")
        await picker.get_by_role("checkbox", name="Select provider Pragmatic Play", exact=True).check()
        await picker.get_by_role("checkbox", name="Select provider Pragmatic Play", exact=True).uncheck()
        assert await picker.get_by_role("button", name="Add selected games", exact=True).is_disabled()
        await picker.get_by_role("checkbox", name="Select provider Pragmatic Play", exact=True).check()
        await page.route("**/games/categories/*", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Cannot add games right now"}'))
        await picker.get_by_role("button", name="Add selected games", exact=True).click()
        await picker.get_by_role("alert").get_by_text("Cannot add games right now", exact=True).wait_for()
        assert await cats.locator("[data-category-game-id]").count() == 0
        await page.unroute("**/games/categories/*")
        # Provider selection includes its second game even when hidden by search.
        await picker.get_by_role("button", name="Add selected games", exact=True).click()
        await picker.get_by_text("gates-of-olympus · In category", exact=True).wait_for()
        assert await cats.locator("[data-category-game-id]").count() == 2
        await picker.get_by_label("Search games to add", exact=True).fill("Book of Dead")
        await picker.locator(".category-picker-game").filter(has=page.get_by_role("checkbox", name="Select game Book of Dead", exact=True)).locator("label").dblclick()
        await picker.get_by_text("book-of-dead · In category", exact=True).wait_for()
        await picker.get_by_label("Search games to add", exact=True).fill("Starburst")
        await picker.locator(".category-picker-game").filter(has=page.get_by_role("checkbox", name="Select game Starburst", exact=True)).locator("label").dblclick()
        await picker.get_by_text("starburst · In category", exact=True).wait_for()
        assert await picker.get_by_role("checkbox", name="Select game Starburst", exact=True).is_disabled()
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 1000})
            assert await picker.evaluate("e => e.getBoundingClientRect().right <= innerWidth && e.getBoundingClientRect().left >= 0 && e.scrollWidth <= e.clientWidth")
            assert await picker.evaluate("e => Math.abs(e.getBoundingClientRect().right - innerWidth) < 1")
        await picker.get_by_role("button", name="Done", exact=True).click()
        assert await cats.locator("[data-category-game-id]").count() == 4
        await cats.get_by_role("button", name="Edit category Featured games", exact=True).click()
        category_editor = page.get_by_role("dialog", name="Edit category: Featured games", exact=True)
        assert await category_editor.get_by_label("CMS identifier", exact=True).input_value() == "homepage-featured"
        assert await category_editor.get_by_role("button", name="Remove category segment VIP", exact=True).count() == 1
        assert await category_editor.get_by_role("button", name="Remove category segment REGISTERED", exact=True).count() == 1
        assert await category_editor.get_by_role("group", name="Tags", exact=True).get_by_role("checkbox", name="homepage", exact=True).is_checked()
        tags = category_editor.get_by_role("group", name="Tags", exact=True)
        assert await tags.evaluate("e => parseFloat(getComputedStyle(e).paddingLeft) >= 18")
        assert await tags.locator("legend").evaluate("e => parseFloat(getComputedStyle(e).paddingLeft) >= 10")
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 1000})
            assert await category_editor.evaluate("e => e.getBoundingClientRect().right <= innerWidth && e.scrollWidth <= e.clientWidth")
        await category_editor.get_by_label("Category name", exact=True).fill("Featured")
        await category_editor.get_by_role("button", name="Save category", exact=True).click()
        await category_editor.wait_for(state="hidden")
        await cats.get_by_role("button", name="Edit category Featured", exact=True).wait_for()
        all_games = request(base, API)[1]["items"]
        by_id = {g["id"]: g for g in all_games}
        rows = cats.locator("[data-category-game-id]")
        ids = await rows.evaluate_all("rows => rows.map(r => r.dataset.categoryGameId)")
        for mode, field in [("popularity", "popularity"), ("new", "created_at"), ("most_played", "play_count")]:
            await cats.get_by_label("Predefined sorting", exact=True).select_option(mode)
            await cats.get_by_role("button", name="Auto-sort", exact=True).click()
            expected = sorted(ids, key=lambda id: by_id[id][field], reverse=True)
            await page.wait_for_function(
                "ids => JSON.stringify([...document.querySelectorAll('[data-category-game-id]')].map(r => r.dataset.categoryGameId)) === JSON.stringify(ids)", arg=expected)
        before = await rows.evaluate_all("rows => rows.map(r => r.dataset.categoryGameId)")
        assert await cats.locator(".category-game-handle").count() == 0
        assert await rows.first.locator(".category-game-actions").evaluate(
            "e => { const r = [...e.children].map(n => n.getBoundingClientRect()); return r.every(v => v.top === r[0].top && v.height === r[0].height); }")
        assert await rows.first.locator(".category-game-actions svg").count() == 3
        await rows.first.drag_to(rows.last)
        await page.wait_for_function(
            "ids => JSON.stringify([...document.querySelectorAll('[data-category-game-id]')].map(r => r.dataset.categoryGameId)) === JSON.stringify(ids)", arg=before[1:] + before[:1])
        await cats.get_by_text("Current sorting: Custom", exact=True).wait_for()
        await cats.get_by_role("button", name="Move up " + by_id[before[0]]["name"], exact=True).click()
        expected_order = before[1:-1] + before[:1] + before[-1:]
        await page.wait_for_function(
            "ids => JSON.stringify([...document.querySelectorAll('[data-category-game-id]')].map(r => r.dataset.categoryGameId)) === JSON.stringify(ids)", arg=expected_order)
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 1000})
            assert await cats.evaluate("e => e.getBoundingClientRect().right <= innerWidth && e.scrollWidth <= e.clientWidth")
        await cats.get_by_role("button", name="Done", exact=True).click()
        await page.reload()
        await page.get_by_role("button", name="Game categories", exact=True).click()
        await cats.get_by_role("button", name="View games in Featured", exact=True).click()
        assert await rows.evaluate_all("rows => rows.map(r => r.dataset.categoryGameId)") == expected_order
        await page.route("**/games/categories/*", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Category temporarily unavailable"}'))
        await cats.get_by_role("button", name="Auto-sort", exact=True).click()
        await cats.get_by_role("alert").get_by_text("Category temporarily unavailable", exact=True).wait_for()
        assert await rows.evaluate_all("rows => rows.map(r => r.dataset.categoryGameId)") == expected_order
        await page.unroute("**/games/categories/*")
        clear = cats.get_by_role("button", name="Clear all games", exact=True)
        assert await clear.evaluate("e => Math.abs(e.getBoundingClientRect().right - e.parentElement.getBoundingClientRect().right) < 1")
        other_categories = {c["id"]: c for c in request(base, API + "/categories")[1]["items"] if c["name"] != "Featured"}
        await clear.click()
        await cats.get_by_text("No games yet. Use Add games to choose games.", exact=True).wait_for()
        assert await clear.is_disabled()
        assert await rows.count() == 0
        assert len(request(base, API)[1]["items"]) == 100
        assert {c["id"]: c for c in request(base, API + "/categories")[1]["items"] if c["name"] != "Featured"} == other_categories
        await page.reload()
        await page.get_by_role("button", name="Game categories", exact=True).click()
        await cats.get_by_role("button", name="View games in Featured", exact=True).click()
        assert await clear.is_disabled()
        await cats.get_by_role("button", name="Add games", exact=True).click()
        picker = page.get_by_role("dialog", name="Add games", exact=True)
        for id in expected_order:
            await picker.get_by_role("checkbox", name="Select game " + by_id[id]["name"], exact=True).check()
        await picker.get_by_role("button", name="Add selected games", exact=True).click()
        await page.wait_for_function("document.querySelectorAll('[data-category-game-id]').length === 4")
        await picker.get_by_role("button", name="Done", exact=True).click()
        await cats.get_by_role("checkbox", name="Featured", exact=True).check()
        await cats.get_by_role("checkbox", name="Slots", exact=True).check()
        await cats.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator("tr[data-game-id]").count() == 4
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        assert "Featured" in await row.inner_text()
        assert "Slots" in await row.inner_text()
        await row.dblclick()
        editor = page.get_by_role("dialog", name="Edit game: Gates of Olympus", exact=True)
        await editor.get_by_label("Name", exact=True).fill("Gates catalog edited")
        await editor.get_by_label("ExternalID", exact=True).fill("friendly-gates")
        assert await editor.get_by_role("group", name="Categories", exact=True).get_by_role("checkbox", name="Featured", exact=True).is_checked()
        assert await editor.get_by_role("group", name="Categories", exact=True).get_by_role("checkbox", name="Slots", exact=True).is_checked()
        await editor.get_by_role("group", name="Categories", exact=True).get_by_role("checkbox", name="Table Games", exact=True).check()
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
        await page.route("**/crm/ui-api/v1/games", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"items": [{k: v for k, v in g.items() if k not in ["popularity", "play_count"]}
                                       for g in all_games]})))
        await page.reload()
        await page.get_by_role("alert").get_by_text("Game catalog API is out of date.", exact=False).wait_for()
        await page.unroute("**/crm/ui-api/v1/games")
        await page.get_by_role("button", name="Retry", exact=True).click()
        await page.get_by_role("button", name="Modify Gates catalog edited", exact=True).wait_for()
        # Custom-only and uncategorized games remain selectable by the bonus editor.
        saved = request(base, API + "/gates-of-olympus")[1]
        featured = next(c for c in request(base, API + "/categories")[1]["items"] if c["name"] == "Featured")
        for ids in [[featured["id"]], []]:
            assert request(base, API + "/gates-of-olympus", "PATCH", {"category_ids": ids})[0] == 200
            await page.goto(base + "/crm/b/e/?new=1")
            await page.get_by_role("button", name="Single game", exact=True).click()
            await page.locator('option[value="gates-of-olympus"]').wait_for(state="attached")
            assert await page.locator('option[value="gates-of-olympus"]').count() == 1
        assert request(base, API + "/gates-of-olympus", "PATCH", {"category_ids": saved["category_ids"]})[0] == 200
        assert not errors, errors
        await browser.close()
        print("Games browser: grouping/logos, filters, categories, edit, status menu, segment picker, mobile and reload passed")


def category_api_checks(base):
    games = request(base, API)[1]["items"]
    by_id = {g["id"]: g for g in games}
    categories = request(base, API + "/categories")[1]["items"]
    slots = next(c for c in categories if c["id"] == "SLOTS")
    assert len(slots["game_ids"]) == 4
    dynamic = next(c for c in categories if c.get("dynamic_kind") == "recent")
    assert dynamic["game_ids"] == [] and dynamic["kind"] == "dynamic"
    for body in [{"game_ids": ["aviator"]}, {"copy_provider_ids": ["spribe"]},
                 {"copy_category_ids": ["SLOTS"]}, {"sort_mode": "new"}, {"kind": "static"}]:
        assert request(base, API + "/categories/" + dynamic["id"], "PATCH", body)[0] == 422
    assert next(c for c in request(base, API + "/categories")[1]["items"] if c["id"] == dynamic["id"]) == dynamic
    status, result = request(base, API + "/categories/" + dynamic["id"], "PATCH", {"segments": ["VIP"], "tags": ["personalized"]})
    assert status == 200 and result["segments"] == ["VIP"] and result["game_ids"] == []
    body = {"name": "API copy", "cms_identifier": "api-copy", "copy_provider_ids": ["pragmatic"],
            "copy_category_ids": ["SLOTS"], "segments": ["VIP", "REGISTERED"],
            "tags": ["popular", "featured"], "sort_mode": "manual"}
    status, copied = request(base, API + "/categories", "POST", body)
    assert status == 201, copied
    assert copied["game_ids"] == slots["game_ids"] and len(set(copied["game_ids"])) == 4
    assert copied["segments"] == body["segments"] and copied["tags"] == body["tags"]
    assert "copy_provider_ids" not in copied and "copy_category_ids" not in copied
    status, union = request(base, API + "/categories", "POST", {
        "name": "API union", "copy_provider_ids": ["spribe"], "copy_category_ids": ["SLOTS"]})
    assert status == 201 and set(union["game_ids"]) == set(slots["game_ids"] + ["aviator", "spaceman"])
    path = API + "/categories/" + copied["id"]
    for body in [{"cms_identifier": "slots"}, {"cms_identifier": "Bad key!"}, {"cms_identifier": 1},
                 {"game_ids": ["missing"]}, {"game_ids": "aviator"}, {"segments": ["missing"]},
                 {"copy_provider_ids": ["missing"]}, {"copy_category_ids": [dynamic["id"]]},
                 {"copy_category_ids": [copied["id"]]}, {"tags": [1]}, {"sort_mode": "random"},
                 {"segments": None}, {"id": "other"}]:
        assert request(base, path, "PATCH", body)[0] == 422, body
        assert next(c for c in request(base, API + "/categories")[1]["items"] if c["id"] == copied["id"]) == copied
    for mode, field in [("popularity", "popularity"), ("new", "created_at"), ("most_played", "play_count")]:
        status, result = request(base, path, "PATCH", {"sort_mode": mode})
        assert status == 200
        assert result["game_ids"] == sorted(slots["game_ids"], key=lambda id: by_id[id][field], reverse=True)
    custom = list(reversed(slots["game_ids"]))
    status, result = request(base, path, "PATCH", {"sort_mode": "manual", "game_ids": custom})
    assert status == 200 and result["game_ids"] == custom
    # Copy sources are a one-time snapshot, not ongoing synchronization.
    source = request(base, API + "/categories", "POST", {"name": "API source", "game_ids": ["aviator"]})[1]
    dest = request(base, API + "/categories", "POST", {"name": "API destination", "copy_category_ids": [source["id"]]})[1]
    request(base, API + "/categories/" + source["id"], "PATCH", {"game_ids": ["aviator", "spaceman"]})
    dest_path = API + "/categories/" + dest["id"]
    status, dest = request(base, dest_path, "PATCH", {"name": "API destination renamed"})
    assert status == 200 and dest["game_ids"] == ["aviator"]
    status, dest = request(base, dest_path, "PATCH", {"game_ids": []})
    assert status == 200 and dest["game_ids"] == []
    assert request(base, API + "/aviator")[1]["category_ids"] == ["CRASH", union["id"], source["id"]]
    assert request(base, API + "/categories")[1]["items"][0] == slots
    # Game-side changes update both membership surfaces, retaining the single-category API.
    game_path = API + "/gates-of-olympus"
    status, game = request(base, game_path, "PATCH", {"category_ids": ["SLOTS", copied["id"]]})
    assert status == 200 and game["category_ids"] == ["SLOTS", copied["id"]]
    status, game = request(base, game_path, "PATCH", {"category": "SLOTS"})
    assert status == 200 and game["category_ids"] == ["SLOTS"]
    assert "gates-of-olympus" not in next(c for c in request(base, API + "/categories")[1]["items"] if c["id"] == copied["id"])["game_ids"]
    print("Categories API: many-to-many, copying, metadata, precise sort order, manual order, dynamic restrictions and validation passed")


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
            # Exercise additive migration from the previous on-disk schema.
            server.terminate()
            server.wait(timeout=10)
            file = Path(storage, "games.json")
            old = json.loads(file.read_text())
            assert len(old["games"]) == 100 and len(old["categories"]) == 20
            assert len({g["name"].casefold() for g in old["games"]}) == 100
            assert len({g["id"] for g in old["games"]}) == 100
            assert len({g["external_id"] for g in old["games"]}) == 100
            assert len({c["name"].casefold() for c in old["categories"]}) == 20
            assert all(c["game_ids"] for c in old["categories"] if c["kind"] == "static")
            del old["demo_expansion_version"]
            del old["demo_category_metadata_version"]
            old["categories"] = [{"id": c["id"], "name": c["name"]} for c in old["categories"] if c["kind"] == "static"]
            for game in old["games"]:
                for key in ["popularity", "play_count", "statistics_source"]:
                    del game[key]
            file.write_text(json.dumps(old))
            server = start(port, env)
            assert all(g["category_ids"] == [g["category"]] and g["statistics_source"] == "demo" for g in request(base, API)[1]["items"])
            baseline_statistics = {g["id"]: (g["popularity"], g["play_count"]) for g in request(base, API)[1]["items"]}
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
                         {"created_at": "changed"}, {"unexpected": True}, {"popularity": 100}, {"play_count": 1},
                         {"statistics_source": "real"}, {"category_ids": ["GC-RECENT"]}, {"category_ids": ["missing"]},
                         {"category_ids": None}, {"category_ids": ["SLOTS"], "category": "CRASH"}]:
                assert request(base, API + "/gates-of-olympus", "PATCH", body)[0] == 422, body
                assert request(base, API + "/gates-of-olympus")[1] == game
            assert request(base, API + "/categories", "POST", {"name": "slots"})[0] == 422
            assert request(base, API + "/categories", "POST", {"name": "  "})[0] == 422
            category_api_checks(base)
            asyncio.run(browser_checks(base))
            # All original IDs remain available to the bonus editor.
            assert {g["id"] for g in request(base, API)[1]["items"]} >= {
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
            cats = request(base, API + "/categories")[1]["items"]
            featured = next(c for c in cats if c["name"] == "Featured")
            assert featured["id"] in saved["category_ids"] and "TABLE_GAMES" in saved["category_ids"] and "SLOTS" in saved["category_ids"]
            assert featured["cms_identifier"] == "homepage-featured"
            assert featured["segments"] == ["VIP", "REGISTERED"] and featured["tags"] == ["popular", "homepage"]
            assert all((g["popularity"], g["play_count"]) == baseline_statistics[g["id"]] for g in request(base, API)[1]["items"])
            assert len([c for c in cats if c["kind"] == "dynamic"]) == 2
            assert len(request(base, API)[1]["items"]) == 100
            assert next(c for c in cats if c.get("dynamic_kind") == "recent")["tags"] == ["personalized"]
            assert Path(storage, "games.json").stat().st_mode & 0o777 == 0o600
            assert Path(storage).stat().st_mode & 0o777 == 0o700
            print("Games API: scopes, atomic validation, provider defaults, categories, private storage and restart persistence passed")
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
