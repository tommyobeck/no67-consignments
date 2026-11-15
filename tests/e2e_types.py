# Purchase and "consigned watch sold" flows (pre-signed mode, the default).
# Run with the app started without COMPANY_PRESIGN=false: python3 tests/e2e_types.py
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

APP, MOCK = "http://localhost:3100", "http://localhost:4010"
results = []
def check(name, cond, detail=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))
def post(url, body, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
def signers(sub_id):
    return json.load(urllib.request.urlopen(urllib.request.Request(f"{MOCK}/submitters?submission_id={sub_id}", headers={"X-Auth-Token": "t"})))["data"]
def complete(sub_id, role):
    post(f"{MOCK}/_test/complete", {"submission_id": sub_id, "role": role}, {"X-Auth-Token": "t"})
    assert post(f"{APP}/api/webhooks/docuseal", {"event_type": "form.completed", "data": {"submission_id": sub_id, "role": role}}, {"X-Webhook-Secret": "whsec"}) == 200
    assert post(f"{APP}/api/webhooks/docuseal", {"event_type": "submission.completed", "data": {"id": sub_id}}, {"X-Webhook-Secret": "whsec"}) == 200

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.route("**/cdn.docuseal.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=""))
    pg.goto(APP + "/admin/login"); pg.fill("input[name=password]", "test-password-123"); pg.click("button[type=submit]"); pg.wait_for_url(APP + "/admin")
    fill = lambda label, v, nth=0: pg.get_by_label(label, exact=True).nth(nth).fill(v)

    # --- Purchase ---
    pg.goto(APP + "/admin/new")
    pg.click("a.pill:has-text('Purchase')")
    pg.wait_for_url("**type=purchase")
    check("purchase form shown", pg.locator("text=Watches and price").count() == 1)
    fill("Full name", "Ana Silva"); fill("Email", "ana@example.com")
    fill("Make", "Patek Philippe"); fill("Model", "Calatrava"); fill("Reference", "3919"); fill("Price (£)", "18,500")
    pg.click("text=+ Add another watch")
    fill("Make", "Rolex", 1); fill("Model", "Explorer", 1); fill("Price (£)", "6500", 1)
    check("total shown", "Total £25,000" in pg.inner_text("main"))
    pg.click("button:has-text('We collect by courier')")
    pg.click("text=Preview the form"); pg.wait_for_selector("iframe.preview-frame")
    check("purchase preview", "Purchase Agreement" in pg.frame_locator("iframe.preview-frame").locator("h1").inner_text())
    pg.screenshot(path="/tmp/e2e-shots/7-purchase-form.png", full_page=True)
    pg.wait_for_timeout(600)
    pg.locator("button[value=email]").scroll_into_view_if_needed(); pg.locator("button[value=email]").click()
    pg.wait_for_url("**/admin/agreements/**")
    pid = int(pg.url.split("/admin/agreements/")[1].split("?")[0])
    body = pg.inner_text("main")
    check("purchase detail page", "Purchase agreement" in body and "£25,000" in body and "Seller" in body, body[:300])
    req = json.load(open("/tmp/mock-out/last-request.json"))
    check("seller role, name prefix", [s["role"] for s in req["submitters"]] == ["Seller"] and req["name"].startswith("Purchase Agreement P-"), req["name"])
    html = open("/tmp/mock-out/last-html.html").read()
    check("purchase html", "No. 67 will arrange collection by insured courier" in html and "Total</th><td>£25,000" in html)
    slug = signers(pid)[0]["slug"]
    pg.goto(f"{APP}/sign/{slug}")
    check("purchase signing page", "Your purchase agreement" in pg.inner_text("h1") and "£25,000" in pg.inner_text(".summary-grid"))
    pg.screenshot(path="/tmp/e2e-shots/8-purchase-sign.png", full_page=True)
    complete(pid, "Seller")
    pg.goto(f"{APP}/sign/{slug}/done")
    check("purchase thank-you", "purchase agreement, and it is now complete" in pg.inner_text("main"))
    pg.goto(APP + "/admin?view=signed")
    check("purchase listed with type", "Purchase agreement" in pg.inner_text("table"))

    # --- A signed consignment to confirm a sale against ---
    pg.goto(APP + "/admin/new?type=consignment")
    fill("Full name", "James Carter"); fill("Email", "james@example.com"); fill("Make", "Rolex"); fill("Model", "Datejust")
    pg.locator("button[value=email]").click(); pg.wait_for_url("**/admin/agreements/**")
    cid = int(pg.url.split("/admin/agreements/")[1].split("?")[0])
    complete(cid, "Consignor")
    cref = json.load(open("/tmp/mock-out/last-request.json"))["submitters"][0]["metadata"]["ref"]

    # --- Consigned watch sold ---
    pg.goto(APP + "/admin/new?type=confirmation")
    opts = pg.locator("#pick-consignment option").all_inner_texts()
    check("signed consignment offered", any(cref in o for o in opts), str(opts))
    pg.select_option("#pick-consignment", cref)
    check("consignor filled in", pg.get_by_label("Consignor name", exact=True).input_value() == "James Carter")
    fill("Make", "Rolex"); fill("Model", "Datejust"); fill("Selling Price (£)", "9000"); fill("Commission and expenses (£)", "900")
    check("consignor price shown", "£8,100" in pg.inner_text("main"))
    pg.screenshot(path="/tmp/e2e-shots/9-confirmation-form.png", full_page=True)
    pg.wait_for_timeout(600)
    pg.locator("button[value=email]").click(); pg.wait_for_url("**/admin/agreements/**")
    fid = int(pg.url.split("/admin/agreements/")[1].split("?")[0])
    html = open("/tmp/mock-out/last-html.html").read()
    check("confirmation html", f"consignment agreement {cref}" in html and "£8,100" in html and "clause 2.3" in html)
    slug = signers(fid)[0]["slug"]
    pg.goto(f"{APP}/sign/{slug}")
    check("confirmation signing page", "Your purchase confirmation" in pg.inner_text("h1"))
    complete(fid, "Consignor")

    emails = open("/tmp/mock-out/emails.log").read(); print(emails)
    check("purchase invite subject", "subject=Your purchase agreement for 2 watches" in emails)
    check("purchase signed copy", "subject=Your signed purchase agreement" in emails and "Purchase Agreement P-" in emails)
    check("confirmation invite subject", "subject=Your purchase confirmation for Rolex Datejust" in emails)
    check("confirmation signed copy", "subject=Your signed purchase confirmation" in emails)
    check("no countersign emails", "Ready to countersign" not in emails)
    b.close()
print(f"{sum(results)}/{len(results)} passed"); sys.exit(0 if all(results) else 1)
