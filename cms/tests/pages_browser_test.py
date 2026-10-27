"""Isolated multi-page CMS navigation and independent publication regression."""
from playwright.async_api import async_playwright
import browser_test as harness


async def check(base, password):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())
        await page.goto(base + "/cms/")
        await page.locator('[name="username"]').fill("cms-browser")
        await page.locator('[name="password"]').fill(password)
        await page.get_by_role("button", name="Sign in", exact=True).click()
        await page.get_by_label("Page URL", exact=True).wait_for()
        assert await page.get_by_label("Page URL", exact=True).is_disabled()
        home_title = await page.get_by_label("Page title", exact=True).input_value()
        burger = page.get_by_role("button", name="Page management", exact=True)
        await burger.click()
        menu = page.get_by_role("region", name="Page management", exact=True)
        await menu.get_by_label("Page title", exact=True).fill("About us")
        await menu.get_by_label("Page URL", exact=True).fill("about")
        await menu.get_by_role("button", name="Create page", exact=True).click()
        await page.wait_for_function("document.querySelector('.editor-properties input')?.value === 'About us'")
        assert await page.locator("[data-module-key]").count() == 0
        await page.get_by_label("New module", exact=True).select_option("text")
        await page.get_by_role("button", name="Add module", exact=True).click()
        await page.get_by_role("button", name="Save draft & preview", exact=True).click()
        await page.get_by_role("status").filter(has_text="Draft saved").wait_for()
        await page.get_by_role("button", name="Publish", exact=True).click()
        await page.get_by_role("status").filter(has_text="Published revision").wait_for()
        link = page.get_by_role("link", name="Open published site", exact=False)
        assert (await link.get_attribute("href")).endswith("/about/")
        public = await browser.new_page()
        await public.goto(base + await link.get_attribute("href"))
        await public.get_by_role("heading", name="Text / information", exact=True).wait_for()
        await burger.click()
        await menu.get_by_label("Page title", exact=True).fill("About copy")
        await menu.get_by_label("Page URL", exact=True).fill("about-copy")
        await menu.get_by_label("Copy selected page", exact=True).check()
        await menu.get_by_role("button", name="Create page", exact=True).click()
        await page.wait_for_function("document.querySelector('.editor-properties input')?.value === 'About copy'")
        assert await page.locator("[data-module-key]").count() == 1
        assert await page.get_by_role("link", name="Open published site", exact=False).count() == 0
        await page.get_by_label("Page title", exact=True).fill("Unsaved copy")
        await burger.click()
        await menu.get_by_role("navigation", name="Page selection", exact=True).get_by_role("button", name=home_title, exact=False).click()
        await page.wait_for_function("(title)=>document.querySelector('.editor-properties input')?.value === title", arg=home_title)
        assert await page.locator("[data-module-key]").count() == 15
        assert await page.get_by_role("link", name="Open published site", exact=False).count() == 0
        await burger.click()
        await menu.get_by_role("navigation").get_by_role("button", name="About us", exact=False).click()
        await page.wait_for_function("document.querySelector('.editor-properties input')?.value === 'About us'")
        assert await page.locator("[data-module-key]").count() == 1
        assert (await link.get_attribute("href")).endswith("/about/")
        for width in (320, 390, 1440):
            await page.set_viewport_size({"width": width, "height": 900})
            await burger.click()
            await menu.wait_for()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await page.keyboard.press("Escape")
            assert await menu.count() == 0
        assert not errors, errors
        await browser.close()
        print("CMS pages: burger selection, blank/copy, independent modules/publication, unsaved switch and mobile passed.")


if __name__ == "__main__":
    harness.browser_check = check
    harness.main()
