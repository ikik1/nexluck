"""Compliance queues, review workflows, matrix risk and context in isolated Chrome."""
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright
from casino_context_test import CasinoContextTests as Server

ROOT = Path(__file__).resolve().parents[3]
MESSAGES = json.loads((ROOT / "localization/crm.json").read_text())


def check_api():
    for owner, expected in ((None, 400), ("bad", 400), ("CS-ffffffffffffffff", 403)):
        assert Server.request("compliance", owner)[0] == expected
    a = Server.request("compliance", Server.a)[1]
    b = Server.request("compliance", Server.b)[1]
    assert [len(a[key]) for key in ("payouts", "kyc_requests", "alerts")] == [24, 29, 30]
    assert [sum(row["status"] == "New" for row in a[key]) for key in ("payouts", "kyc_requests", "alerts")] == [15, 20, 30]
    assert Server.request("compliance/payouts/" + a["payouts"][0]["id"], Server.b, "PATCH", {"status": "Pending"})[0] == 404
    assert Server.request("compliance/risk-matrix", Server.a, "PATCH", {
        "entries": [{"segment_id": b["risk_matrix"][0]["segment_id"], "score": 50}]
    })[0] == 422
    foreign_customer = b["alerts"][0]["customer_id"]
    assert Server.request("compliance/customers/" + foreign_customer + "/block", Server.a, "POST", {})[0] == 404
    for score in (-1, 101, 1.2, True):
        assert Server.request("compliance/risk-matrix", Server.a, "PATCH", {
            "entries": [{"segment_id": a["risk_matrix"][0]["segment_id"], "score": score}]
        })[0] == 422
    Server.stop()
    Server.start()
    assert Server.request("compliance", Server.a)[1] == a


async def check():
    base = Server.base.removesuffix("/crm/ui-api/v1/")
    status, fixtures = Server.request("compliance", Server.a)
    assert status == 200, fixtures
    profiles = Server.request("customers", Server.a)[1]["items"]
    customer_by_id = {row["id"]: row for row in profiles}
    first = sorted((row for row in fixtures["payouts"] if row["status"] == "New"), key=lambda row: (row["created_at"], row["id"]), reverse=True)[0]
    customer = customer_by_id[first["customer_id"]]
    new_segments = []
    for name, tag in (("risk_browser_low", "Low friendly"), ("risk_browser_high", "High friendly")):
        code, segment = Server.request("segments", Server.a, "POST", {
            "name": name, "tag_name": tag,
            "rules": {"kind": "group", "operator": "AND", "not": False, "children": [
                {"kind": "rule", "field": "country", "operator": "IS", "not": False, "value": [customer["country"]]}
            ]}
        })
        assert code == 201, segment
        new_segments.append(segment)
    entries = fixtures["risk_matrix"] + [
        {"segment_id": new_segments[0]["id"], "score": 25},
        {"segment_id": new_segments[1]["id"], "score": 85},
    ]
    assert Server.request("compliance/risk-matrix", Server.a, "PATCH", {"entries": entries})[0] == 200
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/?casino_context=" + Server.a)
        card = page.locator('[data-section="compliance"]')
        await card.wait_for()
        assert "/coml/" in await card.get_attribute("href")
        assert "casino_context=" + Server.a in await card.get_attribute("href")
        await card.click()
        await page.get_by_role("tab", name="Payout requests New 15", exact=True).wait_for()
        assert await page.locator("tbody tr").count() == 15
        assert await page.locator('tbody tr[data-status="New"]').count() == 15
        await page.get_by_role("button", name="Next", exact=True).click()
        assert set(await page.locator('tbody tr').evaluate_all("(rows) => rows.map(row => row.dataset.status)")) == {"Pending", "Approved", "Declined"}
        for status_value in ("pending", "approved", "declined"):
            assert await page.locator("tbody tr.review-" + status_value).count() == 3
        await page.get_by_role("button", name="Previous", exact=True).click()
        row = page.locator(f'tr[data-id="{first["id"]}"]')
        assert await row.locator('[data-column="risk"]').inner_text() == "85/100"
        assert "High friendly" in await row.locator('[data-column="username"]').inner_text()
        assert "risk_browser_high" not in await row.locator('[data-column="username"]').inner_text()
        assert await row.locator('[data-column="username"] .segment-tag').filter(has_text="High friendly").count() == 1
        await row.locator('[data-column="ggr"] button').click()
        await page.get_by_role("dialog", name="Customer segment parameters").wait_for()
        assert await page.locator("[data-parameter]").count() >= 37
        await page.get_by_role("button", name="Done", exact=True).click()

        await page.get_by_text("Filter all fields", exact=True).click()
        assert await page.locator(".compliance-filters").get_by_role("button", name="Segments", exact=True).count() == 1
        assert await page.get_by_label("Filter Created at", exact=True).get_attribute("type") == "date"
        assert await page.get_by_label("Filter Updated at", exact=True).get_attribute("type") == "date"
        local_day = await page.evaluate("""value => {
            const d = new Date(value);
            return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
        }""", first["created_at"])
        await page.get_by_label("Filter Created at", exact=True).fill("2000-01-01")
        assert await page.locator("tbody tr").count() == 0
        await page.get_by_label("Filter Created at", exact=True).fill(local_day)
        assert await page.locator("tbody tr").count() == 15
        await page.get_by_label("Filter Updated at", exact=True).fill(local_day)
        await page.get_by_role("spinbutton", name="Minimum amount", exact=True).fill(str(first["amount"]))
        await page.get_by_role("spinbutton", name="Maximum amount", exact=True).fill(str(first["amount"]))
        assert await page.locator("tbody tr").count() >= 1
        assert all(float(value.replace(",", "")) == first["amount"] for value in
                   await page.locator('tbody [data-column="amount"]').all_text_contents())
        await page.get_by_role("spinbutton", name="Minimum amount", exact=True).fill(str(first["amount"] + 1))
        await page.get_by_role("alert").filter(has_text="Minimum amount must not exceed").wait_for()
        assert await page.locator("tbody tr").count() == 0
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        await page.get_by_role("searchbox", name="Filter External ID", exact=True).fill(first["external_id"])
        assert await page.locator("tbody tr").count() == 1
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        await row.click(button="right")
        await page.get_by_role("menuitem", name="Process ...", exact=True).click()
        await page.get_by_role("dialog").get_by_role("combobox", name="Status", exact=True).select_option("Pending")
        await page.get_by_role("dialog").get_by_role("button", name="Save", exact=True).click()
        await page.get_by_role("tab", name="Payout requests New 14", exact=True).wait_for()
        assert await page.locator(f'tr[data-id="{first["id"]}"]').get_attribute("data-status") == "Pending"
        await page.reload()
        await page.locator(f'tr[data-id="{first["id"]}"][data-status="Pending"]').wait_for()

        await page.locator(f'tr[data-id="{first["id"]}"]').click(button="right")
        await page.get_by_role("menuitem", name="KYC Request", exact=True).click()
        dialog = page.get_by_role("dialog", name="New KYC request", exact=True)
        assert await dialog.get_by_role("combobox", name="Customer", exact=True).input_value() == customer["id"]
        await dialog.get_by_role("textbox", name="Document name", exact=True).fill("Browser compliance proof")
        await dialog.get_by_role("button", name="Create request", exact=True).click()
        await page.get_by_role("tab", name="KYC requests New 21", exact=True).click()
        await page.get_by_text("Browser compliance proof", exact=True).wait_for()
        assert await page.locator('tbody tr[data-status="New"]').count() == 15
        assert "No file uploaded" in await page.locator("tbody tr").first.inner_text()
        await page.get_by_role("button", name="Preview", exact=True).first.click()
        preview = page.get_by_role("dialog", name="Document preview", exact=True)
        await preview.locator("img").wait_for()
        assert await preview.locator("img").evaluate("node => node.complete && node.naturalWidth > 0")
        await preview.get_by_role("button", name="Close Document preview", exact=True).click()

        await page.locator("tbody tr").first.click(button="right")
        await page.get_by_role("menuitem", name="Chat", exact=True).click()
        chat = page.get_by_role("dialog", name="Customer conversation", exact=True)
        await chat.get_by_role("textbox", name="Message", exact=True).fill("Internal compliance browser note")
        await chat.get_by_role("button", name="Save message", exact=True).click()
        await page.locator("tbody tr").first.click(button="right")
        await page.get_by_role("menuitem", name="Chat", exact=True).click()
        await page.get_by_text("Internal compliance browser note", exact=True).wait_for()
        await page.get_by_role("button", name="Close Customer conversation", exact=True).click()
        await page.locator("tbody tr").first.click(button="right")
        await page.get_by_role("menuitem", name="Process ...", exact=True).click()
        await page.get_by_role("dialog").get_by_role("combobox", name="Status", exact=True).select_option("Approved")
        await page.get_by_role("dialog").get_by_role("button", name="Save", exact=True).click()
        await page.get_by_role("tab", name="KYC requests New 20", exact=True).wait_for()
        await page.get_by_text("Filter all fields", exact=True).click()
        await page.get_by_role("searchbox", name="Filter Document name", exact=True).fill("Browser compliance proof")
        await page.locator("tbody tr").first.wait_for()
        assert "review-approved" in await page.locator("tbody tr").first.get_attribute("class")
        assert await page.locator('tbody tr [data-column="kyc"]').first.inner_text() == "VERIFIED"
        await page.get_by_role("button", name="Clear filters", exact=True).click()
        await page.get_by_role("button", name="Next", exact=True).click()
        assert set(await page.locator('tbody tr').evaluate_all("(rows) => rows.map(row => row.dataset.status)")) == {"New", "Pending", "Approved", "Declined"}
        await page.get_by_role("button", name="Previous", exact=True).click()

        await page.get_by_role("button", name="Risk matrix", exact=True).click()
        matrix = page.get_by_role("dialog", name="Risk matrix", exact=True)
        await matrix.get_by_role("spinbutton", name="Risk score risk_browser_high", exact=True).fill("95")
        await matrix.locator(".matrix-row").filter(has=page.get_by_role(
            "spinbutton", name="Risk score risk_browser_low", exact=True)).get_by_role("button", name="Remove", exact=True).click()
        await matrix.get_by_role("combobox", name="Add segment", exact=True).select_option(new_segments[0]["id"])
        await matrix.get_by_role("button", name="Add", exact=True).click()
        await matrix.get_by_role("spinbutton", name="Risk score risk_browser_low", exact=True).fill("40")
        await matrix.get_by_role("button", name="Save", exact=True).click()
        await page.get_by_role("tab", name="Payout requests New 14", exact=True).click()
        assert await page.locator(f'tr[data-id="{first["id"]}"] [data-column="risk"]').inner_text() == "95/100"
        await page.get_by_role("tab", name="Customers with alerts New 30", exact=True).click()
        assert await page.locator('th').filter(has_text="Req status").count() == 0
        assert await page.locator('tbody [data-column="status"]').count() == 0
        assert await page.locator("tbody tr").count() == 15
        assert await page.locator('[data-column="last_session"]').first.inner_text()
        await page.get_by_role("button", name="Next", exact=True).click()
        assert await page.locator("tbody tr").count() == 15
        await page.get_by_role("button", name="Previous", exact=True).click()
        row = page.locator("tbody tr").first
        await row.focus()
        await row.press("Shift+F10")
        assert await page.get_by_role("menuitem").count() == 1
        await page.get_by_role("menuitem", name="Block", exact=True).click()
        blocked_customer_id = await row.locator('[data-column="username"] small').first.inner_text()
        await page.get_by_role("dialog").get_by_role("button", name="Block", exact=True).click()
        await page.locator("tbody tr.customer-blocked").first.wait_for()
        blocked = Server.request("customers/" + blocked_customer_id, Server.a)[1]
        assert blocked["compliance_blocked"] is True
        await page.reload()
        await page.get_by_role("tab", name="Customers with alerts New 30", exact=True).click()
        await page.locator("tbody tr.customer-blocked").first.wait_for()

        for locale in ("ru", "pt-PT", "pt-BR", "es", "en"):
            await page.locator("[data-language-selector]").select_option(locale)
            await page.get_by_role("tab", name=MESSAGES[locale]["Payout requests"] + " " + MESSAGES[locale]["New"] + " 14", exact=True).wait_for()
            assert await page.locator("html").get_attribute("lang") == locale
        await page.locator("#crm-context-select").select_option(Server.b)
        await page.get_by_role("tab", name="Payout requests New 15", exact=True).wait_for()
        assert await page.locator(f'tr[data-id="{first["id"]}"]').count() == 0
        assert "casino_context=" + Server.b in page.url
        await page.set_viewport_size({"width": 390, "height": 844})
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        await page.route("**/crm/ui-api/v1/compliance", lambda route: route.fulfill(
            status=503, content_type="application/json", body='{"error":"Compliance test maintenance"}'))
        await page.reload()
        await page.get_by_role("alert").filter(has_text="Compliance test maintenance").wait_for()
        await page.unroute("**/crm/ui-api/v1/compliance")
        await page.get_by_role("button", name="Retry", exact=True).click()
        await page.get_by_role("tab", name="Payout requests New 15", exact=True).wait_for()
        assert not errors, errors
        await browser.close()


if __name__ == "__main__":
    Server.setUpClass()
    try:
        check_api()
        asyncio.run(check())
        print("Compliance browser: queues, filters, review/KYC/chat, risk maximum, locales, isolation and mobile passed.")
    finally:
        Server.tearDownClass()
