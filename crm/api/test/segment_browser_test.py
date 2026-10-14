"""Run with python3 crm/api/test/segment_browser_test.py (Playwright + Chrome)."""
import asyncio
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]


def request(base, path, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + path, headers=headers, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as response:
        return response.code, json.load(response)


def start(port, env):
    process = subprocess.Popen(["ruby", "crm/api/server.rb", str(port)], cwd=ROOT, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError(process.stderr.read().decode())
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/crm/ui-api/v1/segments", timeout=1).close()
            return process
        except urllib.error.URLError:
            time.sleep(0.05)
    process.terminate()
    process.wait(timeout=10)
    raise RuntimeError("Segment API did not start")


def token(base, env, scope):
    auth = base64.b64encode(("segment-test:" + env["CRM_CLIENT_SECRET"]).encode()).decode()
    req = urllib.request.Request(base + "/crm/api/v1/oauth/token",
                                 data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": scope}).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + auth})
    with urllib.request.urlopen(req) as response:
        return json.load(response)["access_token"]


async def check_browser(base):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(10000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(base + "/crm/c/list/")
        await page.get_by_role("link", name="luna.play", exact=True).wait_for()
        await page.get_by_role("button", name="Segments", exact=True).wait_for()
        await page.evaluate("""async () => {
          const params = (await apiRequest(SEGMENT_API+'/parameters')).items;
          for(const [key,values] of [
            ['favourite_game',DEMO_GAME_CATALOG.map(g=>g.name)],
            ['favourite_category',[...new Set(DEMO_GAME_CATALOG.map(g=>g.category))]],
            ['favourite_provider',[...new Set(DEMO_GAME_CATALOG.map(g=>g.provider))]]
          ]) {
            if(JSON.stringify(params.find(p=>p.key===key).options.slice().sort())!==JSON.stringify(values.slice().sort()))
              throw Error('Segment game catalog drift: '+key);
          }
          const c = {...(await customerRequest('/CU-1001')), birthday:'1985-10-14',
            created_at:'2026-08-01T00:00:00Z', devices:['Desktop','Mobile'],
            activity:{last_login_at:'2026-10-12T00:00:00Z',overall_game_hours:5000,last_session_hours:3},
            gender:'Female',sessions_per_week:4,bonus_wr_rate:65,risk_indicators:['rdw','multiple_payment_methods']};
          const now=Date.parse('2026-10-13T00:00:00Z'), day=86400000;
          const ws=WALLETS.slice(), ts=WALLET_TX.slice();
          try {
            WALLETS.splice(0,WALLETS.length,
              {id:'E',customer_id:c.id,type:'Real',currency:'EUR',balance:750},
              {id:'B',customer_id:c.id,type:'Bonus',currency:'EUR',balance:20},
              {id:'U',customer_id:c.id,type:'Real',currency:'USD',balance:9000});
            const tx=(wallet,type,amount,note='',ago=0)=>({wallet,type,amount,note,ts:now-ago*day,currency:wallet==='U'?'USD':'EUR'});
            WALLET_TX.splice(0,WALLET_TX.length,
              tx('E','Deposit',1000),tx('E','Deposit',100,'',7),tx('E','Withdrawal',-100),
              tx('E','Bet',-100,'Gates of Olympus'),tx('E','Bet',-200,'Gates of Olympus'),
              tx('E','Win',50),tx('U','Deposit',10000),tx('U','Bet',-1000,'Aviator'),tx('U','Win',10),
              tx('E','Deposit',9999,'',-1),tx('OTHER','Bet',-9999,'Aviator'),tx('B','Bonus wagering',-10));
            const facts=segmentFacts(c,now);
            const expected={country:'DE',geo_zone:'Europe',currency:'EUR',lang:'de',age:40,gender:'Female',
              funnel_status:'Lead',registration_date:'2026-08-01',account_age:73,kyc_status:'NOT_STARTED',
              days_since_login:1,hours_in_game:5000,session_time:3,sessions_per_week:4,devices:['Desktop','Mobile'],
              lifetime_ggr:250,net_cash_flow:1000,number_of_deposits:3,deposit_frequency:21/73,
              real_balance:750,bonus_balance:20,win_over_loss:-250,favourite_game:['Gates of Olympus','Aviator'],
              favourite_category:['Slots','Crash'],favourite_provider:['Pragmatic Play','Spribe'],favourite_type:['Slots','Crash'],
              average_bet:150,bonus_wr_rate:65,loyalty_points:300,rdw_rate:3,
              risk_rdw:true,risk_bonus_abuse:false,risk_multiple_payment_methods:true,
              risk_abnormal_activity:false,risk_failed_kyc_attempts:false,risk_multiple_ips:false};
            if(params.length!==Object.keys(expected).length) throw Error('Incomplete parameter coverage');
            const rule=(field,value,operator='IS',not=false)=>({kind:'rule',field,value,operator,not,currency:'EUR',days:30});
            for(const p of params) {
              const actual=p.money?facts.monetary(rule(p.key,0)):facts.values[p.key];
              if(JSON.stringify(actual)!==JSON.stringify(expected[p.key])) throw Error(p.key+': '+JSON.stringify(actual));
              const value=p.type==='list'&&!Array.isArray(expected[p.key])?[expected[p.key]]:expected[p.key];
              if(evaluateSegment(rule(p.key,value),facts,params)!==true) throw Error('Matching '+p.key);
            }
            for(const [op,value] of [['>',249],['<',251],['>=',250],['=<',250],['<=',250],['=',250],['IS',250],['!=',251]])
              if(evaluateSegment(rule('lifetime_ggr',value,op),facts,params)!==true) throw Error('Operator '+op);
            for(const [op,value] of [['>',250],['<',250],['>=',251],['=<',249],['=',251],['!=',250]])
              if(evaluateSegment(rule('lifetime_ggr',value,op),facts,params)!==false) throw Error('Boundary '+op);
            if(evaluateSegment(rule('registration_date','2026-08-02','<'),facts,params)!==true) throw Error('Date order');
            if(evaluateSegment(rule('country',['DE','AT']),facts,params)!==true) throw Error('List OR');
            if(evaluateSegment(rule('country',['SE'],'!='),facts,params)!==true) throw Error('List inequality');
            if(facts.monetary({...rule('lifetime_ggr',0),currency:'USD'})!==990) throw Error('Currency mixing');
            if(facts.monetary({...rule('net_cash_flow',0),days:1})!==900) throw Error('Cash flow period');
            const group=(operator,children,not=false)=>({kind:'group',operator,children,not});
            const nested=group('AND',[rule('country',['DE']),group('OR',[rule('lifetime_ggr',500,'>'),rule('risk_bonus_abuse',true,'IS',true)])]);
            if(evaluateSegment(nested,facts,params)!==true) throw Error('Nested boolean logic');
            if(evaluateSegment({...nested,not:true},facts,params)!==false) throw Error('Group NOT');
            const missing={...rule('real_balance',0,'>',true),currency:'BTC'};
            if(evaluateSegment(missing,facts,params)!==null) throw Error('NOT missing data matched');
            if(evaluateSegment(group('OR',[missing,rule('country',['DE'])]),facts,params)!==true) throw Error('Unknown OR');
            if(evaluateSegment(group('AND',[missing,rule('country',['DE'])],true),facts,params)!==null) throw Error('Unknown group NOT');
            const noLogin=segmentFacts({...c,activity:{...c.activity,last_login_at:null}},now);
            if(evaluateSegment(rule('days_since_login',0,'>',true),noLogin,params)!==null) throw Error('No login');
            if(segmentFacts({...c,birthday:'1985-10-13'},now).values.age!==41) throw Error('Birthday boundary');
          } finally { WALLETS.splice(0,WALLETS.length,...ws); WALLET_TX.splice(0,WALLET_TX.length,...ts); }
        }""")
        print("All 36 segment parameters, operators, currency windows and unknown/NOT semantics passed")

        await page.get_by_role("button", name="Segments", exact=True).click()
        library = page.get_by_role("dialog", name="Segments", exact=True)
        vip_row = library.get_by_label("Select segment VIP", exact=True)
        await vip_row.locator(".segment-tag").dblclick()
        assert await vip_row.get_by_role("checkbox").is_checked()
        assert "selected" in (await vip_row.get_attribute("class")).split()
        await vip_row.locator(".segment-tag").dblclick()
        assert not await vip_row.get_by_role("checkbox").is_checked()
        assert "selected" not in (await vip_row.get_attribute("class")).split()
        await library.get_by_role("button", name="Edit segment API_EDITED", exact=True).click()
        api_editor = page.get_by_role("dialog", name="Edit segment", exact=True)
        await api_editor.get_by_role("button", name="+ Add rule", exact=True).click()
        assert await api_editor.get_by_label("Segmentation parameter", exact=True).count() == 2
        await api_editor.get_by_role("button", name="Cancel", exact=True).click()
        await library.get_by_role("button", name="+ New segment", exact=True).click()
        editor = page.get_by_role("dialog", name="New segment", exact=True)
        await editor.get_by_role("button", name="Edit Country values", exact=True).click()
        picker = page.get_by_role("dialog", name="Country list editor", exact=True)
        await picker.get_by_label("Search values").fill("Germany")
        await picker.get_by_role("checkbox", name="DE · Germany", exact=True).check()
        await picker.get_by_label("Search values").fill("Sweden")
        await picker.get_by_role("checkbox", name="SE · Sweden", exact=True).check()
        await picker.get_by_label("Search values").fill("Austria")
        await picker.get_by_role("checkbox", name="AT · Austria", exact=True).check()
        await picker.get_by_role("checkbox", name="AT · Austria", exact=True).uncheck()
        await picker.get_by_role("button", name="Apply values").click()
        assert await editor.get_by_role("button", name="Edit Country values").inner_text() == "DE/SE\n…"
        assert "COUNTRY_[DE, SE]" == await editor.get_by_label("Segment name", exact=True).input_value()
        await editor.get_by_role("button", name="+ Add rule", exact=True).click()
        await editor.get_by_label("Segmentation parameter", exact=True).nth(1).select_option("lifetime_ggr")
        await editor.get_by_label("Rule operator", exact=True).nth(1).select_option(">")
        await editor.get_by_label("Rule value", exact=True).fill("-10000")
        await editor.get_by_role("button", name="+ Add rule", exact=True).click()
        await editor.get_by_label("Segmentation parameter", exact=True).nth(2).select_option("risk_bonus_abuse")
        await editor.locator(".segment-rule").nth(2).get_by_role("checkbox", name="NOT", exact=True).check()
        assert "NOT_BONUS_ABUSER" in await editor.get_by_label("Segment name", exact=True).input_value()
        await editor.get_by_label("Segment name", exact=True).fill("DE_SE_TEST")
        await editor.get_by_role("button", name="Save segment", exact=True).click()
        await library.get_by_role("button", name="Edit segment DE_SE_TEST", exact=True).wait_for()
        await library.get_by_label("Search segments").fill("DE_SE_TEST")
        assert await library.locator(".segment-library-item").count() == 1
        await library.get_by_role("checkbox").check()
        await library.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator("tbody tr").count() == 1
        assert await page.get_by_role("link", name="max_rider", exact=True).count() == 1
        assert await page.locator("tbody .segment-tag").filter(has_text="DE_SE_TEST").count() == 1
        await page.reload()
        await page.get_by_role("button", name="Segments", exact=True).click()
        await library.get_by_role("button", name="Edit segment DE_SE_TEST", exact=True).click()
        edit = page.get_by_role("dialog", name="Edit segment", exact=True)
        assert await edit.get_by_label("Segment name", exact=True).input_value() == "DE_SE_TEST"
        await edit.get_by_role("button", name="+ Add AND/OR group", exact=True).first.click()
        await edit.get_by_label("Segmentation parameter", exact=True).nth(3).select_option("risk_abnormal_activity")
        await edit.get_by_role("button", name="Save segment", exact=True).click()
        await library.get_by_role("button", name="Done", exact=True).click()
        await page.get_by_role("link", name="max_rider", exact=True).click()
        await page.locator(".customer-center h2").wait_for()
        for width in [1440, 1000, 600, 414, 320]:
            await page.set_viewport_size({"width": width, "height": 896})
            await page.evaluate("""() => {
              const grid = document.querySelector('.customer-sat');
              const cards = [...grid.children];
              const rects = Object.fromEntries(cards.map(card => [
                getComputedStyle(card).gridArea.split(' / ')[0], card.getBoundingClientRect()
              ]));
              const near = (a,b) => {
                if(Math.abs(a-b) > 1) throw Error(`Tile alignment: ${a} != ${b}`);
              };
              const gap = (a,b) => near(a,b+16);
              if(cards.length !== 6) throw Error('Missing customer tiles');
              if(document.documentElement.scrollWidth > innerWidth) throw Error('Profile overflow');
              if(getComputedStyle(grid).gap !== '16px') throw Error('Unequal tile gaps');
              for(const card of cards) {
                const style = getComputedStyle(card);
                if(style.borderRadius !== '10px' ||
                   getComputedStyle(card.querySelector('h2')).textTransform !== 'uppercase')
                  throw Error('Customer tile style differs from bonus editor');
              }
              if(innerWidth > 1050) {
                near(rects.risk.top,rects.wallets.top);
                near(rects.risk.bottom,rects.wallets.bottom);
                near(rects.gaming.top,rects.bonus.top);
                near(rects.gaming.bottom,rects.bonus.bottom);
                near(rects.center.top,rects.risk.top);
                near(rects.center.bottom,rects.gaming.bottom);
                gap(rects.center.left,rects.risk.right);
                gap(rects.wallets.left,rects.center.right);
                gap(rects.gaming.top,rects.risk.bottom);
                gap(rects.bonus.top,rects.wallets.bottom);
                gap(rects.loyalty.top,rects.center.bottom);
              } else if(innerWidth > 600) {
                near(rects.risk.top,rects.wallets.top);
                near(rects.risk.bottom,rects.wallets.bottom);
                near(rects.gaming.top,rects.bonus.top);
                near(rects.gaming.bottom,rects.bonus.bottom);
                gap(rects.risk.top,rects.center.bottom);
                gap(rects.wallets.left,rects.risk.right);
                gap(rects.gaming.top,rects.risk.bottom);
                gap(rects.bonus.top,rects.wallets.bottom);
                gap(rects.loyalty.top,rects.gaming.bottom);
              } else {
                const ordered = ['center','risk','wallets','gaming','bonus','loyalty'];
                for(let i=1;i<ordered.length;i++) {
                  gap(rects[ordered[i]].top,rects[ordered[i-1]].bottom);
                  near(rects[ordered[i]].left,rects.center.left);
                  near(rects[ordered[i]].right,rects.center.right);
                }
              }
            }""")
        await page.set_viewport_size({"width": 1440, "height": 1000})
        await page.get_by_role("button", name="View customer segments", exact=True).click()
        profile = page.get_by_role("dialog", name="max_rider segments", exact=True)
        await profile.locator(".segment-tag").filter(has_text="DE_SE_TEST").wait_for()
        assert await profile.locator(".segment-tag").filter(has_text="VIP").count() == 0
        await profile.get_by_role("button", name="Edit segment DE_SE_TEST", exact=True).click()
        await edit.get_by_label("Segment name", exact=True).fill("RENAMED_SEGMENT")
        await edit.get_by_role("button", name="Save segment", exact=True).click()
        await profile.locator(".segment-tag").filter(has_text="RENAMED_SEGMENT").wait_for()
        await profile.get_by_role("button", name="Done", exact=True).click()
        await page.get_by_role("button", name="Edit", exact=True).click()
        await page.get_by_label("Gender", exact=True).select_option("Undisclosed")
        await page.get_by_role("button", name="Save customer", exact=True).click()
        await page.get_by_text("Customer updated successfully.").wait_for()
        await page.get_by_role("button", name="View segment parameters", exact=True).click()
        values = page.get_by_role("dialog", name="Customer segment parameters", exact=True)
        await values.locator('[data-parameter="gender"]').wait_for()
        assert await values.locator('[data-parameter]').count() == 36
        assert await values.locator('.parameter-group').count() == 7
        assert await values.locator('[data-parameter="gender"]').inner_text() == "Undisclosed"
        assert "SE" == await values.locator('[data-parameter="country"]').inner_text()
        assert await values.locator('[data-parameter="lifetime_ggr"] b').all_text_contents() == ["EUR", "USD"]
        await values.get_by_label("Parameter cash flow days").fill("1")
        expected = await page.evaluate("""async () => {
          const c=await customerRequest('/CU-1002');
          return segmentFacts(c).monetary({field:'net_cash_flow',currency:'EUR',days:1}).toLocaleString('en-GB',{maximumFractionDigits:4});
        }""")
        assert "EUR: " + expected in await values.locator('[data-parameter="net_cash_flow"]').inner_text()
        await values.get_by_label("Parameter cash flow days").fill("0")
        assert await values.get_by_role("alert").count() == 1
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await values.evaluate("""dialog => {
              const groups = [...dialog.querySelectorAll('.parameter-group')];
              const rects = groups.map(group => group.getBoundingClientRect());
              for(let i=1;i<rects.length;i++) {
                if(Math.abs(rects[i].left-rects[0].left)>1 ||
                   Math.abs(rects[i].width-rects[0].width)>1 ||
                   Math.abs(rects[i].top-rects[i-1].bottom-16)>1)
                  throw Error('Parameter groups must form one evenly spaced vertical list');
              }
            }""")
        await page.keyboard.press("Escape")
        assert await values.count() == 0
        await page.get_by_role("button", name="View customer segments", exact=True).click()
        await profile.get_by_role("button", name="Edit segment RENAMED_SEGMENT", exact=True).click()
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await edit.get_by_role("button", name="Edit Country values", exact=True).first.click()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await page.keyboard.press("Escape")
            assert await edit.count() == 1
        await page.keyboard.press("Escape")
        assert await edit.count() == 0 and await profile.count() == 1
        await page.keyboard.press("Escape")
        assert await profile.count() == 0
        await page.set_viewport_size({"width": 1440, "height": 1000})
        await page.goto(base + "/crm/b/e/?id=BN-1001")
        await page.get_by_role("button", name="Edit include segments", exact=True).wait_for()
        for kind in ["include", "exclude"]:
            await page.get_by_role("button", name="Edit " + kind + " segments", exact=True).click()
            picker = page.get_by_role("dialog", name="Segments", exact=True)
            await picker.get_by_role("searchbox").fill("RENAMED_SEGMENT")
            option = picker.locator(".segment-library-item").filter(has_text="RENAMED_SEGMENT")
            await option.wait_for()
            await option.click()
            assert "selected" not in (await option.get_attribute("class")).split()
            await option.hover()
            assert await option.evaluate("row => getComputedStyle(row).outlineStyle") == "solid"
            await option.dblclick()
            assert "selected" in (await option.get_attribute("class")).split()
            assert await option.get_by_text("Selected", exact=True).count() == 0
            await option.dblclick()
            assert "selected" not in (await option.get_attribute("class")).split()
            await option.dblclick()
            assert "selected" in (await option.get_attribute("class")).split()
            await picker.get_by_role("button", name="Edit segment RENAMED_SEGMENT", exact=True).click()
            await page.get_by_role("dialog", name="Edit segment", exact=True).wait_for()
            await page.keyboard.press("Escape")
            assert await picker.count() == 1
            for width in [320, 414, 1440]:
                await page.set_viewport_size({"width": width, "height": 896})
                assert await picker.evaluate("dialog => dialog.getBoundingClientRect().right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth")
            await picker.get_by_role("button", name="Done", exact=True).click()
            tag = page.get_by_role("button", name="Remove RENAMED_SEGMENT from " + kind + " segments", exact=True)
            assert await tag.count() == 1
            await tag.click()
            assert await tag.count() == 1
        await page.get_by_role("button", name="Save changes", exact=True).click()
        await page.get_by_text("Saved", exact=True).wait_for()
        await page.reload()
        for kind in ["include", "exclude"]:
            tag = page.get_by_role("button", name="Remove RENAMED_SEGMENT from " + kind + " segments", exact=True)
            await tag.wait_for()
            await tag.dblclick()
            assert await tag.count() == 0
        await page.get_by_role("button", name="Save changes", exact=True).click()
        await page.get_by_text("Saved", exact=True).wait_for()
        await page.reload()
        await page.get_by_role("button", name="Edit include segments", exact=True).wait_for()
        assert await page.get_by_role("button", name="Remove RENAMED_SEGMENT from include segments", exact=True).count() == 0
        await page.get_by_role("button", name="Edit include segments", exact=True).click()
        picker = page.get_by_role("dialog", name="Segments", exact=True)
        await picker.get_by_role("searchbox").fill("VIP")
        await picker.get_by_label("Select segment VIP", exact=True).press("Enter")
        await picker.get_by_role("button", name="+ New segment", exact=True).click()
        new_editor = page.get_by_role("dialog", name="New segment", exact=True)
        await new_editor.get_by_label("Segmentation parameter", exact=True).select_option("risk_bonus_abuse")
        await new_editor.get_by_label("Segment name", exact=True).fill("BONUS_SHARED_SEGMENT")
        await new_editor.get_by_role("button", name="Save segment", exact=True).click()
        await picker.get_by_role("searchbox").fill("BONUS_SHARED_SEGMENT")
        await picker.get_by_label("Select segment BONUS_SHARED_SEGMENT", exact=True).dblclick()
        await page.keyboard.press("Escape")
        await page.get_by_role("button", name="Remove VIP from include segments", exact=True).press("Delete")
        assert await page.get_by_role("button", name="Remove VIP from include segments", exact=True).count() == 0
        assert await page.get_by_role("button", name="Remove BONUS_SHARED_SEGMENT from include segments", exact=True).count() == 1
        await page.goto(base + "/crm/f/")
        await page.get_by_role("button", name="+ New connection", exact=True).click()
        connection = page.get_by_role("dialog", name="New payment connection", exact=True)
        await connection.get_by_label("Connection name", exact=True).fill("Shared segment connection")
        await connection.get_by_role("button", name="Edit connection segments", exact=True).click()
        picker = page.get_by_role("dialog", name="Segments", exact=True)
        await picker.get_by_role("searchbox").fill("BONUS_SHARED_SEGMENT")
        row = picker.get_by_label("Select segment BONUS_SHARED_SEGMENT", exact=True)
        await row.click()
        assert "selected" not in (await row.get_attribute("class")).split()
        await row.hover()
        assert await row.evaluate("r => getComputedStyle(r).outlineStyle") == "solid"
        await row.dblclick()
        assert "selected" in (await row.get_attribute("class")).split()
        assert await row.get_by_text("Selected", exact=True).count() == 0
        await row.dblclick()
        assert "selected" not in (await row.get_attribute("class")).split()
        await row.dblclick()
        assert "selected" in (await row.get_attribute("class")).split()
        await picker.get_by_role("button", name="Edit segment BONUS_SHARED_SEGMENT", exact=True).click()
        await page.get_by_role("dialog", name="Edit segment", exact=True).wait_for()
        await page.keyboard.press("Escape")
        assert await picker.count() == 1 and await connection.count() == 1
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await picker.evaluate("d => d.getBoundingClientRect().right <= innerWidth && d.scrollWidth <= d.clientWidth")
        await page.keyboard.press("Escape")
        assert await picker.count() == 0 and await connection.count() == 1
        assert await connection.get_by_role("button", name="Remove segment BONUS_SHARED_SEGMENT", exact=True).count() == 1
        await connection.get_by_role("button", name="Save connection", exact=True).click()
        connectivity = page.get_by_role("button", name="Shared segment connection connectivity:", exact=False)
        await connectivity.click()
        connection = page.get_by_role("dialog", name="Edit payment connection", exact=True)
        tag = connection.get_by_role("button", name="Remove segment BONUS_SHARED_SEGMENT", exact=True)
        await tag.click()
        assert await tag.count() == 1
        await tag.dblclick()
        assert await tag.count() == 0
        await connection.get_by_role("button", name="Cancel", exact=True).click()
        await connectivity.click()
        assert await tag.count() == 1
        await tag.press("Delete")
        await connection.get_by_role("button", name="Save connection", exact=True).click()
        await connectivity.click()
        assert await tag.count() == 0
        await connection.get_by_role("button", name="Edit connection segments", exact=True).click()
        await picker.get_by_role("searchbox").fill("VIP")
        await picker.get_by_label("Select segment VIP", exact=True).press("Enter")
        await page.keyboard.press("Escape")
        assert await connection.get_by_role("button", name="Remove segment VIP", exact=True).count() == 1
        await connection.get_by_role("button", name="Save connection", exact=True).click()
        assert await page.locator("tbody tr").filter(has_text="Shared segment connection").locator(".tag").filter(has_text="VIP").count() == 1
        assert not errors, errors
        await browser.close()
        print("Segment editor, search pickers, tags, filtering, nested rules, profile membership, gender and mobile passed")


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="nexluck-segment-test-") as storage:
        env = dict(os.environ, CRM_CUSTOMER_DATA_DIR=storage, CRM_CLIENT_ID="segment-test",
                   CRM_CLIENT_SECRET=secrets.token_hex(24), CRM_JWT_SECRET=secrets.token_hex(32))
        server = start(port, env)
        try:
            assert request(base, "/crm/api/v1/segments")[0] == 401
            read = token(base, env, "segments:read")
            assert request(base, "/crm/api/v1/segments", token=read)[0] == 200
            assert request(base, "/crm/api/v1/segments", "POST", {}, read)[0] == 403
            assert request(base, "/crm/ui-api/v1/segments", "POST", {})[0] == 422
            assert request(base, "/crm/ui-api/v1/segments/SG-9999")[0] == 404
            assert request(base, "/crm/ui-api/v1/segments/parameters", "POST", {})[0] == 405
            write = token(base, env, "segments:write")
            body = {"name": "API_SEGMENT", "rules": {"kind": "rule", "field": "age", "operator": ">=", "value": 18, "not": False}}
            status, saved = request(base, "/crm/api/v1/segments", "POST", body, write)
            assert status == 201
            assert request(base, "/crm/api/v1/segments/" + saved["id"], "PATCH",
                           dict(body, name="API_EDITED"), write)[0] == 200
            assert request(base, "/crm/ui-api/v1/segments", "POST", dict(body, name="api_edited"))[0] == 422
            bonus_path = "/crm/ui-api/v1/bonuses/BN-1002"
            assert request(base, bonus_path, "PATCH", {"availability": {"includeSegments": ["API_EDITED"], "excludeSegments": ["VIP"]}})[0] == 200
            assert request(base, bonus_path, "PATCH", {"availability": {"includeSegments": ["DOES_NOT_EXIST"]}})[0] == 422
            assert request(base, "/crm/ui-api/v1/segments/" + saved["id"], "PATCH", dict(body, name="API_RENAMED"))[0] == 200
            assert request(base, bonus_path, "PATCH", {"description": "Keep previously selected segment names"})[0] == 200
            assert request(base, bonus_path)[1]["availability"]["includeSegments"] == ["API_EDITED"]
            assert request(base, "/crm/ui-api/v1/bonuses/BN-1003", "PATCH", {"availability": {"includeSegments": ["API_EDITED"]}})[0] == 422
            assert request(base, "/crm/ui-api/v1/segments/" + saved["id"], "PATCH", dict(body, name="API_EDITED"))[0] == 200
            new_bonus = request(base, "/crm/ui-api/v1/bonuses/BN-1004")[1]
            new_bonus["name"] = "Segment selection test bonus"
            new_bonus["availability"]["includeSegments"] = ["API_EDITED"]
            new_bonus["availability"]["excludeSegments"] = ["VIP"]
            status, created = request(base, "/crm/ui-api/v1/bonuses", "POST", new_bonus)
            assert status == 201
            assert created["availability"]["includeSegments"] == ["API_EDITED"]
            assert created["availability"]["excludeSegments"] == ["VIP"]
            asyncio.run(check_browser(base))
        finally:
            server.terminate()
            server.wait(timeout=10)
        server = start(port, env)
        try:
            items = request(base, "/crm/ui-api/v1/segments")[1]["items"]
            assert any(s["name"] == "RENAMED_SEGMENT" for s in items)
            assert any(s["name"] == "API_EDITED" for s in items)
            assert request(base, "/crm/ui-api/v1/customers/CU-1002")[1]["gender"] == "Undisclosed"
            assert Path(storage, "segments.json").stat().st_mode & 0o777 == 0o600
            print("Segment API scopes, validation, CRUD, private file permissions and restart persistence passed")
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
