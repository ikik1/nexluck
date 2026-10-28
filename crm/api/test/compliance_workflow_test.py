"""Player-to-CRM demo payout, message, document and explicit KYC approval regression."""
import asyncio
from playwright.async_api import async_playwright
from casino_context_test import CasinoContextTests as Server


def request(path, method="GET", body=None, casino=None):
    status, payload = Server.request(path, casino or Server.a, method, body)
    assert status < 300, (status, payload)
    return payload


def setup_workflow():
    data = request("compliance")
    customers = request("customers")["items"]
    customer = next(customer for customer in customers if
                    any(row["customer_id"] == customer["id"] for row in data["kyc_requests"]) and
                    not any(row["customer_id"] == customer["id"] and row["status"] in ("Declined", "Approved")
                            for row in data["kyc_requests"]))
    wallet = request("compliance/demo-wallet?customer=" + customer["id"])
    messages = request("compliance/customers/" + customer["id"] + "/chat")["items"]
    request("compliance/customers/" + customer["id"] + "/chat/read", "POST", {"ids": [item["id"] for item in messages]})
    assert all("settings" not in row for row in wallet["connections"])
    connection = next(row for row in wallet["connections"] if row["currency"] == "EUR" and "Visa" in row["methods"])
    base = "compliance/demo-wallet"
    payout = {"connection_id": connection["id"], "method": "Visa", "destination": "4102 xxxxxx 1234",
              "currency": "EUR", "amount": 20, "request_key": "workflow-idempotency-0001"}
    assert Server.request(base + "/payouts?customer=CU-999", Server.a, "POST", payout)[0] == 404
    assert Server.request(base + "/payouts?customer=" + customer["id"], Server.b, "POST", payout)[0] == 404
    for destination in ("4102123412341234", "4102 xxxx 123456", "4102 123456 1234"):
        assert Server.request(base + "/payouts?customer=" + customer["id"], Server.a, "POST",
                              {**payout, "destination": destination})[0] == 422
    row = request(base + "/payouts?customer=" + customer["id"], "POST", payout)
    assert row["status"] == "New" and row["payment_brand"] == connection["brand"]
    assert request(base + "/payouts?customer=" + customer["id"], "POST", payout)["id"] == row["id"]
    assert Server.request(base + "/payouts?customer=" + customer["id"], Server.a, "POST",
                          {**payout, "amount": 30})[0] == 409
    assert Server.request("compliance/payouts/" + row["id"], Server.a, "PATCH", {"status": "Approved"})[0] == 422
    request("finance/connections/" + str(connection["id"]), "PATCH", {"payin": True, "payout": False})
    assert not any(item["id"] == connection["id"] for item in request(base)["connections"])
    assert Server.request(base + "/payouts?customer=" + customer["id"], Server.a, "POST",
                          {**payout, "request_key": "workflow-idempotency-0002"})[0] == 422
    request("finance/connections/" + str(connection["id"]), "PATCH", {"payin": True, "payout": True})
    assert Server.request(base + "/chat?customer=" + customer["id"], Server.a, "POST",
                          {"message": "Cross-site"}, origin="https://attacker.example")[0] == 403
    return customer, connection, row


async def check_browser(customer, connection, payout):
    base = Server.base.removesuffix("/crm/ui-api/v1/")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        crm = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        crm.on("pageerror", lambda error: errors.append(str(error)))
        await crm.goto(base + "/coml/?casino_context=" + Server.a)
        await crm.get_by_role("tab", name="Payout requests", exact=False).wait_for()
        await crm.get_by_text("Filter all fields", exact=True).click()
        await crm.get_by_label("Filter External ID", exact=True).fill(payout["external_id"])
        row = crm.locator('tr[data-id="' + payout["id"] + '"]')
        assert "4102 xxxxxx 1234" in await row.inner_text()
        details = row.locator('[data-column="payment_method"] .payout-payment-details')
        assert await details.inner_text() == "Card: 4102 xxxxxx 1234"
        assert connection["brand"] in await row.locator('[data-column="payment_method"] > span').inner_text()
        await row.click(button="right")
        await crm.get_by_role("menuitem", name="Process ...", exact=True).click()
        dialog = crm.get_by_role("dialog", name="Process request", exact=True)
        assert "4102 xxxxxx 1234" in await dialog.inner_text()
        assert connection["brand"] in await dialog.inner_text()
        assert await dialog.get_by_role("combobox").count() == 0
        await dialog.get_by_role("button", name="Approve", exact=True).click()
        await row.locator('[data-column="status"]').get_by_text("Pending", exact=True).wait_for()
        await row.click(button="right")
        assert await crm.get_by_role("menuitem", name="Process ...", exact=True).is_disabled()
        await crm.keyboard.press("Escape")

        wallet = await browser.new_page(viewport={"width": 390, "height": 844})
        wallet.on("pageerror", lambda error: errors.append(str(error)))
        await wallet.goto(base + "/w/?casino_context=" + Server.a + "&customer=" + customer["id"])
        await wallet.get_by_role("button", name="KYC & chat (demo)", exact=True).click()
        await wallet.get_by_label("Message to Compliance", exact=True).fill("Please review my new document")
        await wallet.get_by_role("button", name="Send demo message", exact=True).click()
        await wallet.get_by_text("Saved in Compliance.", exact=True).wait_for()
        await wallet.get_by_label("Demo document version name", exact=True).fill("Passport version 2")
        await wallet.get_by_role("button", name="Submit demo document", exact=True).click()
        await wallet.get_by_role("button", name="Submit demo document", exact=True).wait_for(state="visible")
        await wallet.wait_for_function("!document.querySelector('#player-document').disabled")
        first_request = request("compliance/demo-wallet?customer=" + customer["id"])["requests"][0]
        await wallet.get_by_label("Demo document version name", exact=True).fill("Passport version 3")
        await wallet.get_by_role("button", name="Submit demo document", exact=True).click()
        await wallet.wait_for_function("!document.querySelector('#player-document').disabled")
        await crm.reload()
        await crm.get_by_role("tab", name="KYC requests", exact=False).click()
        await crm.get_by_text("Filter all fields", exact=True).click()
        await crm.get_by_label("Filter External ID", exact=True).fill(first_request["external_id"])
        row = crm.locator('tr[data-id="' + first_request["id"] + '"]')
        await row.get_by_role("button", name="new chat message 1", exact=True).wait_for()
        assert await row.get_by_role("button", name="Approve KYC", exact=True).count() == 0
        await row.click(button="right")
        assert await crm.get_by_role("menuitem", name="Approve KYC", exact=True).is_disabled()
        await crm.keyboard.press("Escape")
        request("compliance/demo-wallet/chat?customer=" + customer["id"], "POST", {"message": "Second player message"})
        await row.get_by_role("button", name="new chat message 2", exact=True).wait_for(timeout=20000)
        indicator = row.get_by_role("button", name="new chat message 2", exact=True)
        assert await indicator.evaluate("node => getComputedStyle(node).fontWeight") == "700"
        await indicator.hover()
        assert await indicator.evaluate("node => getComputedStyle(node).backgroundColor") != "rgba(0, 0, 0, 0)"
        history = row.get_by_role("button", name="Document history", exact=True)
        assert await history.get_attribute("class") == "btn"
        assert await history.get_attribute("aria-expanded") == "false"
        await history.click()
        assert await history.get_attribute("aria-expanded") == "true"
        await row.get_by_role("button", name="Passport version 2", exact=False).click()
        await crm.get_by_role("dialog", name="Document preview", exact=True).get_by_text("Passport version 2", exact=False).wait_for()
        await crm.get_by_role("button", name="Close Document preview", exact=True).click()
        await row.get_by_role("button", name="new chat message 2", exact=True).click()
        await crm.get_by_text("Please review my new document", exact=True).wait_for()
        assert await crm.locator(".compliance-chat .chat-message-new").count() == 2
        assert await crm.locator(".compliance-chat li:not(.chat-message-new)").count() == 12
        await crm.get_by_role("button", name="Close Customer conversation", exact=True).click()
        await row.locator(".compliance-chat-link").wait_for(state="hidden")
        await row.click(button="right")
        await crm.get_by_role("menuitem", name="Chat", exact=True).click()
        await crm.get_by_text("Please review my new document", exact=True).wait_for()
        assert await crm.locator(".compliance-chat .chat-message-new").count() == 0
        await crm.get_by_role("button", name="Close Customer conversation", exact=True).click()
        data = request("compliance")
        assert all(item["unread_messages"] == 0 for item in data["kyc_requests"] if item["customer_id"] == customer["id"])
        for item in data["kyc_requests"]:
            if item["customer_id"] == customer["id"] and item["status"] != "Approved":
                request("compliance/kyc-requests/" + item["id"], "PATCH", {"status": "Approved"})
        assert request("customers/" + customer["id"])["kyc_status"] == "PENDING"
        await crm.reload()
        await crm.get_by_role("tab", name="KYC requests", exact=False).click()
        await crm.get_by_text("Filter all fields", exact=True).click()
        await crm.get_by_label("Filter External ID", exact=True).fill(first_request["external_id"])
        row = crm.locator('tr[data-id="' + first_request["id"] + '"]')
        await row.click(button="right")
        assert await crm.get_by_role("menuitem", name="Approve KYC", exact=True).is_enabled()
        await crm.get_by_role("menuitem", name="Approve KYC", exact=True).click()
        await crm.get_by_role("dialog", name="Approve KYC", exact=True).get_by_role("button", name="Approve KYC", exact=True).click()
        await row.locator('[data-column="kyc"]').get_by_text("VERIFIED", exact=True).wait_for()
        assert await row.get_by_role("button", name="Approve KYC", exact=True).count() == 0
        request("compliance/demo-wallet/documents?customer=" + customer["id"], "POST",
                {"request_id": first_request["id"], "name": "Replacement after verification"})
        assert request("customers/" + customer["id"])["kyc_status"] == "PENDING"
        assert Server.request("compliance/customers/" + customer["id"] + "/approve-kyc", Server.a, "POST", {})[0] == 409

        await wallet.get_by_role("button", name="Close", exact=True).click()
        await wallet.locator("#wl-withdraw").click()
        await wallet.get_by_label("Payment connection", exact=True).select_option(str(connection["id"]))
        await wallet.get_by_role("button", name="Visa", exact=True).click()
        await wallet.get_by_label("Amount (EUR)", exact=True).fill("15")
        await wallet.get_by_label("Card first 4 digits (demo)", exact=True).fill("4102")
        await wallet.get_by_label("Card last 4 digits (demo)", exact=True).fill("5678")
        await wallet.locator("#w-go").click()
        await wallet.get_by_text("Demo payout request saved in Compliance.", exact=True).wait_for()
        assert any(row.get("masked_destination") == "4102 xxxxxx 5678" for row in request("compliance")["payouts"])
        await crm.goto(base + "/crm/f/?casino_context=" + Server.a)
        search = crm.get_by_role("searchbox", name="Search payment connections", exact=True)
        await search.fill(connection["name"])
        await crm.get_by_role("button", name="Search", exact=True).click()
        finance_row = crm.locator("tbody tr").filter(has_text=connection["name"])
        await finance_row.get_by_role("button").click()
        editor = crm.get_by_role("dialog", name="Edit payment connection", exact=True)
        await editor.get_by_label("Payin", exact=True).uncheck()
        await editor.get_by_label("Payout", exact=True).check()
        await editor.get_by_role("button", name="Save connection", exact=True).click()
        await editor.wait_for(state="hidden")
        await crm.get_by_label("Payment direction", exact=True).select_option("payin")
        assert await finance_row.count() == 0
        await crm.get_by_label("Payment direction", exact=True).select_option("payout")
        await finance_row.wait_for()
        assert not errors, errors
        await browser.close()


if __name__ == "__main__":
    Server.setUpClass()
    try:
        customer, connection, payout = setup_workflow()
        asyncio.run(check_browser(customer, connection, payout))
        Server.stop()
        Server.start()
        data = request("compliance")
        assert any(row.get("masked_destination") == "4102 xxxxxx 5678" for row in data["payouts"])
        saved = next(row for row in request("finance")["connections"] if row["id"] == connection["id"])
        assert saved["payin"] is False and saved["payout"] is True
        print("Compliance workflow: player payout/masked destination, direction eligibility, chat unread/read, document history, explicit KYC approval and restart persistence passed.")
    finally:
        Server.tearDownClass()
