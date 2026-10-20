"""Run with python3 crm/api/test/analytics_browser_test.py (Playwright + Chrome)."""
import asyncio
import os
from pathlib import Path
import secrets
import socket
import tempfile

from playwright.async_api import async_playwright
from segment_browser_test import start


async def check(base):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(base + "/crm/")
        await page.locator('a[href="/crm/a/"]').first.click()
        await page.get_by_role("heading", name="Filter every report", exact=True).wait_for()
        assert await page.title() == "NexLuck CRM — Analytics"
        assert await page.locator("[data-report]").count() == 16
        assert await page.locator(".analytics-topic").count() == 4
        assert "DEMO ANALYTICS" in await page.locator(".analytics-notice").inner_text()
        assert await page.locator(".analytics-report > details").count() == 16
        assert await page.locator(".analytics-help button").count() == 16
        assert await page.locator(".analytics-signal").count() == 16
        assert await page.locator(".analytics-report .analytics-trend").count() == 16
        assert await page.locator(".analytics-kpi .analytics-trend").count() == 6
        assert await page.locator(".analytics-kpi").evaluate_all(
            "nodes=>new Set(nodes.map(n=>getComputedStyle(n).backgroundColor)).size") == 6
        pipeline = page.get_by_role("list", name="Cumulative acquisition milestones", exact=True)
        assert await pipeline.locator(".pipeline-arrow").count() == 4
        assert await pipeline.locator("li").evaluate_all(
            "nodes=>new Set(nodes.map(n=>getComputedStyle(n).backgroundColor)).size") == 5
        assert await pipeline.locator(".pipeline-share").count() == 5
        pipeline_counts = await pipeline.locator("strong").all_text_contents()
        assert int(pipeline_counts[0]) > 0
        assert int(pipeline_counts[2]) > 0
        help_button = page.get_by_role("button", name="About Revenue bridge", exact=True)
        await help_button.focus()
        assert await page.locator("#hint-revenue").is_visible()
        await page.get_by_label("Casino website", exact=True).select_option(index=1)
        toggle = page.get_by_role("button", name="Filter every report", exact=True)
        await toggle.click()
        collapsed = page.locator(".analytics-filter-toggle")
        assert await collapsed.get_attribute("aria-expanded") == "false"
        assert "Casino website:" in await collapsed.inner_text()
        await page.wait_for_timeout(300)
        assert await page.get_by_label("From", exact=True).is_hidden()
        assert await page.locator("#analytics-filter-body").get_attribute("inert") is not None
        await collapsed.click()
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        assert await page.get_by_role("button", name="Export filtered summary CSV", exact=True).evaluate(
            "e=>getComputedStyle(e).borderRadius") == "6px"
        assert await page.evaluate("crmNavigationMatches('management reports').some(p=>p.href==='/crm/a/')")
        # Construct a separate model for exact filter and aggregate checks.
        await page.evaluate("""async () => {
          const fetchItems = async p => (await (await fetch('/crm/ui-api/v1/'+p)).json()).items;
          const [games,categories,publishers,parameters,segments] = await Promise.all(
            ['games','games/categories','games/publishers','segments/parameters','segments'].map(fetchItems));
          window.testAnalytics = createAnalyticsDemo(games,categories,publishers,
            parameters.find(p=>p.key==='funnel_status').options);
          testAnalytics.segmentDefinitions=segments;testAnalytics.parameters=parameters;
        }""")
        assert "today is partial" in await page.locator(".analytics-notice").inner_text()
        assert await page.get_by_role("link", name="Go to external BI system", exact=False).get_attribute("aria-disabled") == "true"
        assert await page.get_by_role("link", name="Go to external BI system", exact=False).get_attribute("href") is None
        assert await page.locator(".retention-growth svg").count() == 1
        assert await page.locator(".analytics-report .analytics-trend").evaluate_all(
            "nodes=>nodes.every(n=>n.textContent==='Trend N/A')")
        # Use a complete end date for previous-period comparisons.
        await page.get_by_label("To", exact=True).fill(await page.evaluate("analyticsDate(Date.parse(testAnalytics.end)-ANALYTICS_DAY)"))
        from_date = await page.get_by_label("From", exact=True).input_value()
        to_date = await page.get_by_label("To", exact=True).input_value()
        result = await page.evaluate("""({from,to}) => {
          const scope = analyticsScope(testAnalytics,{from,to});
          const t = analyticsSummary(scope);
          const sum = k => scope.rows.reduce((n,r)=>n+r[k],0);
          if(Math.abs(t.ggr-(sum('stake')-sum('wins')))>1e-6) throw Error('GGR mismatch');
          const ngr = sum('ggr')-sum('bonus')-sum('tax')-sum('fees')-sum('providerFee')-sum('chargebackLoss');
          if(Math.abs(t.ngr-ngr)>1e-6) throw Error('NGR mismatch');
          if(t.active!==new Set(scope.rows.map(r=>r.player)).size) throw Error('Active mismatch');
          for (const [key] of ANALYTICS_DIMENSIONS) {
            const groups=analyticsGroups(scope,key);
            if(Math.abs(groups.reduce((n,g)=>n+g.ngr,0)-t.ngr)>1e-6) throw Error('Grouping mismatch '+key);
          }
          const snapshot = testAnalytics.statuses.map(s=>scope.players.filter(p=>p.statusAt(scope.asOf)===s).length);
          if(snapshot.reduce((a,b)=>a+b,0)!==scope.players.length) throw Error('Lifecycle mismatch');
          const entrants = scope.players.filter(p=>p.lead>=scope.from);
          const milestones=['lead','registered','ftd','trusted','vip'].map(k=>entrants.filter(p=>p[k]!==null && p[k]<=scope.asOf).length);
          if(milestones.some((n,i)=>i>0 && n>milestones[i-1])) throw Error('Non-monotone pipeline');
          return {profiles:scope.players.length,facts:scope.rows.length};
        }""", {"from": from_date, "to": to_date})
        assert f'{result["profiles"]} scoped profiles / {result["facts"]} activity facts' in await page.get_by_role("status").inner_text()
        await page.evaluate("""({from,to}) => {
          const previous=analyticsPrevious(testAnalytics,{from,to,site:ANALYTICS_SITES[0]});
          if(!previous || Date.parse(previous.to)!==Date.parse(from)-ANALYTICS_DAY) throw Error('Comparison adjacency');
          if(Date.parse(to)-Date.parse(from)!==Date.parse(previous.to)-Date.parse(previous.from)) throw Error('Comparison duration');
          if(previous.scope.players.some(p=>p.site!==ANALYTICS_SITES[0])) throw Error('Comparison filter');
          if(analyticsPrevious(testAnalytics,{from:testAnalytics.start,to:testAnalytics.end})!==null) throw Error('Partial comparison');
          if(analyticsChange(100,0)!==null || analyticsChange(0,0)!==0 || analyticsChange(-50,-100)!==50) throw Error('Trend edge case');
          if(Math.abs(analyticsChange(.9,.8,true)-10)>1e-9) throw Error('Percentage points');
          if(analyticsChange(null,10)!==null) throw Error('Missing trend');
          const rule=ANALYTICS_SIGNALS.payments;
          if(analyticsHealth(.95,rule)!=='good' || analyticsHealth(.9,rule)!=='warn' || analyticsHealth(.89,rule)!=='bad') throw Error('Approval boundaries');
          const low=ANALYTICS_SIGNALS.bonuses;
          if(analyticsHealth(.05,low)!=='good' || analyticsHealth(.15,low)!=='warn' || analyticsHealth(.16,low)!=='bad') throw Error('Abuse boundaries');
          if(analyticsHealth(null,rule)!=='neutral') throw Error('Missing health');
        }""", {"from": from_date, "to": to_date})
        await page.get_by_label("From", exact=True).fill(await page.evaluate("testAnalytics.start"))
        assert await page.locator(".analytics-report .analytics-trend").evaluate_all(
            "nodes=>nodes.every(n=>n.textContent==='Trend N/A')")
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        await page.get_by_label("To", exact=True).fill(to_date)
        assert await page.locator(".report-value .analytics-metric").evaluate_all(
            "nodes=>nodes.every(n=>Math.abs(n.firstElementChild.getBoundingClientRect().top-n.lastElementChild.getBoundingClientRect().top)<12)")
        # Every dimension is a working data predicate, not a cosmetic selector.
        dimensions = await page.evaluate("ANALYTICS_DIMENSIONS")
        for key, label in dimensions:
            if key == "segment":
                continue
            control = page.get_by_role("combobox", name=label, exact=True)
            values = await control.locator("option").evaluate_all("o=>o.map(v=>v.value).filter(Boolean)")
            assert values, label
            value = values[0]
            await control.select_option(value)
            expected = await page.evaluate("""({key,value,from,to}) => {
              const end=Date.parse(to);
              const players=testAnalytics.players.filter(p=>p.lead<=end &&
                (key==='status'?p.statusAt(end):p[key])===value);
              const ids=new Set(players.map(p=>p.id));
              const rows=testAnalytics.rows.filter(r=>ids.has(r.player) && r.date>=from && r.date<=to);
              return players.length+' scoped profiles / '+rows.length+' activity facts';
            }""", {"key": key, "value": value, "from": from_date, "to": to_date})
            assert expected in await page.get_by_role("status").inner_text(), label
            assert await page.locator("[data-report]").count() == 16
            await control.select_option("")
        # Shared Customer segment definitions, OR selection and removable tags.
        await page.get_by_role("button", name="Segments", exact=True).click()
        segments_dialog = page.get_by_role("dialog", name="Segments", exact=True)
        await segments_dialog.get_by_role("button", name="+ New segment", exact=True).click()
        editor = page.get_by_role("dialog", name="New segment", exact=True)
        await editor.get_by_label("Segment name", exact=True).fill("Analytics Germany")
        await editor.get_by_label("Segmentation parameter", exact=True).select_option("lifetime_ggr")
        assert await editor.get_by_label("Rule currency", exact=True).input_value() == "EUR"
        await editor.get_by_label("Segmentation parameter", exact=True).select_option("country")
        await editor.get_by_role("button", name="Edit Country values", exact=True).click()
        values_dialog = page.get_by_role("dialog", name="Country list editor", exact=True)
        await values_dialog.get_by_role("checkbox", name="DE · Germany", exact=True).check()
        await values_dialog.get_by_role("button", name="Apply values", exact=True).click()
        await editor.get_by_role("button", name="Save segment", exact=True).click()
        await editor.wait_for(state="hidden")
        await segments_dialog.get_by_label("Select segment Analytics Germany", exact=True).dblclick()
        await segments_dialog.get_by_role("button", name="Done", exact=True).click()
        expected = await page.evaluate("""async ({from,to}) => {
          testAnalytics.segmentDefinitions=(await (await fetch(SEGMENT_API)).json()).items;
          const saved=testAnalytics.segmentDefinitions.find(s=>s.name==='Analytics Germany');
          const scope=analyticsScope(testAnalytics,{from,to,segment:[saved.id]});
          if(!scope.players.length || scope.players.some(p=>p.country!=='DE')) throw Error('Saved custom rules ignored');
          return scope.players.length+' scoped profiles / '+scope.rows.length+' activity facts';
        }""", {"from": from_date, "to": to_date})
        assert expected in await page.get_by_role("status").first.inner_text()
        await page.locator(".analytics-segment-filter .segment-tag button").click()
        await page.get_by_role("button", name="Segments", exact=True).click()
        for name in ["VIP", "REGISTERED"]:
            await segments_dialog.get_by_label("Select segment " + name, exact=True).dblclick()
        await segments_dialog.get_by_role("button", name="Done", exact=True).click()
        assert await page.locator(".analytics-segment-filter .segment-tag").count() == 2
        expected = await page.evaluate("""({from,to}) => {
          const ids=testAnalytics.segmentDefinitions.filter(s=>['VIP','REGISTERED'].includes(s.name)).map(s=>s.id);
          const scope=analyticsScope(testAnalytics,{from,to,segment:ids});
          if(scope.players.some(p=>!p.segmentIds.some(id=>ids.includes(id)))) throw Error('Segment OR mismatch');
          return scope.players.length+' scoped profiles / '+scope.rows.length+' activity facts';
        }""", {"from": from_date, "to": to_date})
        assert expected in await page.get_by_role("status").first.inner_text()
        remove = page.locator(".analytics-segment-filter .segment-tag button").first
        await remove.click()
        assert await page.locator(".analytics-segment-filter .segment-tag").count() == 1
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        await page.get_by_label("To", exact=True).fill(to_date)
        await page.get_by_label("Group tables by", exact=True).select_option("provider")
        assert "Provider" in await page.locator('[data-report="products"] thead').inner_text()
        async with page.expect_download() as download_info:
            await page.get_by_role("button", name="Export filtered summary CSV", exact=True).click()
        download = await download_info.value
        csv = Path(await download.path()).read_text()
        assert '"name","players","active","ggr","ngr"' in csv
        assert "Pragmatic Play" in csv
        await page.evaluate("""() => {
          const data=testAnalytics, filters={from:analyticsDate(Date.parse(data.end)-29*ANALYTICS_DAY),to:data.end};
          const vip=data.segmentDefinitions.find(s=>s.name==='VIP');
          const answer=analyticsAsk(data,filters,'Show me GGR for a customer segment VIP for today');
          if(answer.error || answer.filters.segment[0]!==vip.id || answer.filters.from!==data.end || answer.filters.to!==data.end) throw Error('VIP today parsing');
          const expected=analyticsSummary(analyticsScope(data,{...filters,from:data.end,to:data.end,segment:[vip.id]}));
          if(Math.abs(expected.ggr-answer.totals.ggr)>1e-8) throw Error('AI GGR');
          const top=analyticsAsk(data,filters,'What are my cusomers with higherst GGR');
          if(top.error || top.rows.some((r,i)=>i && r.ggr>top.rows[i-1].ggr)) throw Error('AI ranking');
          const campaign=analyticsAsk(data,filters,'Show me results for the recent affiliate compaign');
          if(campaign.error || campaign.filters.channel!=='Affiliate' || !campaign.filters.campaign) throw Error('AI campaign');
          const site=ANALYTICS_SITES[1];
          const siteResult=analyticsAsk(data,{...filters,site},'Show me results for the recent affiliate campaign');
          if(siteResult.error || siteResult.filters.site!==site) throw Error('Inherited website scope');
          const latest=analyticsScope(data,{...filters,site,channel:'Affiliate'}).players.sort((a,b)=>b.lead-a.lead || a.campaign.localeCompare(b.campaign))[0];
          if(siteResult.filters.campaign!==latest.campaign) throw Error('Recent campaign scope');
          const namedCampaign=analyticsAsk(data,filters,'results for affiliate campaign VIP return');
          if(namedCampaign.error || namedCampaign.filters.segment.length) throw Error('Campaign name mistaken for segment');
          if(!analyticsAsk(data,filters,'tell me a joke').error || !analyticsAsk(data,filters,'GGR segment imaginary').error ||
            !analyticsAsk(data,filters,'GGR tomorrow').error || !analyticsAsk(data,filters,'GGR 2026-02-31').error ||
            !analyticsAsk(data,filters,'results for affiliate campaign nonexistent').error) throw Error('AI rejection');
          const scope=analyticsScope(data,filters), points=analyticsRetentionGrowth(scope);
          const registered=scope.players.filter(p=>p.registered!==null && p.registered>=scope.from && p.registered<=scope.asOf);
          if(points.length!==30 || points.some((p,i)=>p.cohort!==registered.length || p.returned>p.cohort || (i && p.returned<points[i-1].returned))) throw Error('Growth shape');
          const returned=registered.filter(p=>new Set(scope.rows.filter(r=>r.player===p.id).map(r=>r.date)).size>=2).length;
          if(points[points.length-1].returned!==returned) throw Error('Growth reconciliation');
          if(analyticsPrevious(data,filters)!==null) throw Error('Partial comparison');
          const endScope=analyticsScope(data,{from:data.start,to:data.end});
          if(endScope.completeThrough!==Date.parse(data.end)-ANALYTICS_DAY) throw Error('Partial retention maturity');
          const player=data.players.find(p=>p.currency==='EUR' && data.rowsByPlayer.get(p.id).length);
          const rule={kind:'rule',field:'lifetime_ggr',operator:'IS',value:analyticsSum(data.rowsByPlayer.get(player.id),'ggr'),currency:'EUR',not:false};
          const adapter={...data,segmentDefinitions:[
            {id:'eur',rules:rule},
            {id:'usd',rules:{...rule,currency:'USD'}},
            {id:'unknown',rules:{...rule,field:'real_balance',not:true}}]};
          if(JSON.stringify(analyticsSegmentIds(adapter,player,Date.parse(data.end)))!==JSON.stringify(['eur'])) throw Error('Currency/unknown rule semantics');
          const dates=[0,0.5,0.999].map(fraction=>Date.parse(data.end)+fraction*ANALYTICS_DAY);
          const snapshot=dates.map(time=>createAnalyticsDemo(
            [{id:'g',name:'Test game',publisher_id:'p',rtp:96}],
            [{kind:'static',game_ids:['g'],name:'Test category'}],
            [{id:'p',name:'Test provider'}],data.statuses,time));
          const count=s=>s.rows.filter(r=>r.date===s.end).length;
          if(count(snapshot[0])!==0 || count(snapshot[1])<=0 || count(snapshot[2])<=count(snapshot[1])) throw Error('Partial-day sampling');
          if(snapshot.some((s,i)=>s.generatedAt!==new Date(dates[i]).toISOString() || s.partialDate!==s.end)) throw Error('Generation watermark');
          const emptyPoints=analyticsRetentionGrowth({...scope,players:[],rows:[]});
          if(emptyPoints.some(p=>p.cohort!==0 || p.returned!==0 || p.rate!==null)) throw Error('Empty growth rate');
        }""")
        await page.get_by_role("button", name="Ask AI", exact=True).click()
        ask = page.get_by_role("dialog", name="Ask AI", exact=True)
        await ask.get_by_role("button", name="Show me GGR for a customer segment VIP for today", exact=True).click()
        assert "TODAY IS PARTIAL" in await ask.get_by_role("log").inner_text()
        await ask.get_by_label("Your request", exact=True).fill("tell me a joke")
        await ask.get_by_role("button", name="Ask", exact=True).click()
        await ask.get_by_role("alert").wait_for()
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await ask.evaluate("e=>e.scrollWidth<=e.clientWidth && e.getBoundingClientRect().right<=innerWidth")
        await ask.get_by_role("button", name="Apply this scope to dashboard", exact=True).first.click()
        assert await page.get_by_label("From", exact=True).input_value() == await page.evaluate("testAnalytics.end")
        assert await page.locator(".analytics-segment-filter .segment-tag").count() == 1
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        # Exact-day retention fixture: an immature registrant must not dilute D7.
        await page.evaluate("""() => {
          const start=Date.parse('2026-10-01'), end=Date.parse('2026-10-10');
          const scope={from:start,asOf:end,players:[
            {id:'a',registered:start},{id:'b',registered:start+8*ANALYTICS_DAY}],
            rows:[{player:'a',date:'2026-10-08'}]};
          const d7=analyticsRetention(scope,7), d30=analyticsRetention(scope,30);
          if(d7.eligible!==1 || d7.returned!==1 || d7.rate!==1) throw Error('D7 maturity');
          if(d30.eligible!==0 || d30.rate!==null) throw Error('D30 maturity');
          const empty=analyticsSummary({players:[],rows:[],from:start,asOf:end});
          if(empty.ggr!==0 || empty.arpu!==null || empty.paymentSuccess!==null) throw Error('Empty semantics');
          const negative=analyticsSummary({players:[],rows:[{stake:100,wins:110,ggr:-10,ngr:-12,
            bonus:2,tax:0,fees:0,providerFee:0,chargebackLoss:0,attempts:0,approved:0,
            deposits:0,withdrawals:0,chargebacks:0,rounds:1,sessions:1,claims:1,abusiveClaims:0,player:'a'}],from:start,asOf:end});
          if(negative.ngr!==-12 || negative.hold!==-0.1 || negative.rtp!==1.1) throw Error('Negative revenue');
        }""")
        # Impossible site/game combination produces explicit empty data, not stale KPIs.
        await page.get_by_label("Casino website", exact=True).select_option(index=1)
        await page.get_by_label("Funnel status", exact=True).select_option("Lead")
        await page.get_by_label("KYC status", exact=True).select_option("VERIFIED")
        await page.get_by_label("Game", exact=True).select_option(index=1)
        assert "0 activity facts" in await page.get_by_role("status").first.inner_text()
        assert "N/A" in await page.locator(".analytics-kpis").inner_text()
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        await page.get_by_label("From", exact=True).fill(to_date)
        await page.get_by_label("To", exact=True).fill(from_date)
        await page.get_by_role("alert").wait_for()
        assert await page.locator("[data-report]").count() == 0
        assert await page.get_by_role("button", name="Export filtered summary CSV", exact=True).is_disabled()
        await page.get_by_role("button", name="Reset filters", exact=True).click()
        for width in [320, 414, 1440]:
            await page.set_viewport_size({"width": width, "height": 896})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        spec = await page.request.get(base + "/crm/a/REPORTS.md")
        spec_text = await spec.text()
        for report_id in await page.locator("[data-report]").evaluate_all("nodes=>nodes.map(n=>n.dataset.report)"):
            assert f'id="{report_id}"' in spec_text
        await page.route("**/segments/parameters", lambda r: r.fulfill(
            status=503, content_type="application/json", body='{"error":"Catalog maintenance"}'))
        await page.reload()
        await page.get_by_role("alert").get_by_text("Catalog maintenance", exact=False).wait_for()
        await page.unroute("**/segments/parameters")
        await page.get_by_role("button", name="Retry analytics", exact=True).click()
        await page.locator('[data-report="retention"]').wait_for()
        await page.goto(base + "/a/")
        await page.wait_for_url("**/crm/a/")
        await page.locator('[data-report="retention"]').wait_for()
        await page.goto(base + "/crm/section.html?s=analytics")
        await page.wait_for_url("**/crm/a/")
        await page.locator('[data-report="retention"]').wait_for()
        assert not errors, errors
        await browser.close()
        print("Analytics: 16 reports, shared/custom segment rules, local Ask AI, partial today, retention growth, revenue reconciliation, filters, trends, CSV, error recovery, redirects and mobile passed")


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="nexluck-analytics-test-") as storage:
        env = dict(os.environ, CRM_CUSTOMER_DATA_DIR=storage, CRM_CLIENT_ID="segment-test",
                   CRM_CLIENT_SECRET=secrets.token_hex(24), CRM_JWT_SECRET=secrets.token_hex(32))
        server = start(port, env)
        try:
            asyncio.run(check(f"http://127.0.0.1:{port}"))
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
