# Pre-signed mode (the default): only the consignor signs, then it is complete.
# Run with the app started without COMPANY_PRESIGN=false: python3 tests/e2e_presign.py
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

APP, MOCK = "http://localhost:3100", "http://localhost:4010"
results = []
def check(name, cond):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name)
def post(url, body, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page()
    pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.route("**/cdn.docuseal.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=""))
    pg.goto(APP + "/admin/login"); pg.fill("input[name=password]", "test-password-123"); pg.click("button[type=submit]"); pg.wait_for_url(APP + "/admin")
    pg.goto(APP + "/admin/new")
    for label, v in [("Full name", "Ana Silva"), ("Email", "ana@example.com"), ("Make", "Patek Philippe"), ("Model", "Calatrava")]:
        pg.get_by_label(label, exact=True).fill(v)
    pg.get_by_label("Commission (e.g. 10% or 10% + VAT)", exact=True).fill("10% + VAT")
    pg.locator("button[value=email]").click()
    pg.wait_for_url("**/admin/agreements/**")
    sub_id = int(pg.url.split("/admin/agreements/")[1].split("?")[0])
    check("detail shows signed when sent", "Signed when sent" in pg.inner_text("main"))
    req = json.load(open("/tmp/mock-out/last-request.json"))
    check("only the consignor signs in DocuSeal", [s["role"] for s in req["submitters"]] == ["Consignor"])
    html = open("/tmp/mock-out/last-html.html").read()
    check("typed signature on the form", 'class="typed-sig">Tommy Zhao<' in html and 'role="Company"' not in html)
    check("commission with VAT wording", "10% + VAT, calculated on the Selling Price." in html)
    slug = req and json.load(urllib.request.urlopen(urllib.request.Request(f"{MOCK}/submitters?submission_id={sub_id}", headers={"X-Auth-Token": "t"})))["data"][0]["slug"]
    pg.goto(f"{APP}/sign/{slug}")
    check("signing page says already signed by Tommy", "already been signed by Tommy" in pg.inner_text("main"))
    post(f"{MOCK}/_test/complete", {"submission_id": sub_id, "role": "Consignor"}, {"X-Auth-Token": "t"})
    check("consignor webhook ok (no countersign email)", post(f"{APP}/api/webhooks/docuseal", {"event_type": "form.completed", "data": {"submission_id": sub_id, "role": "Consignor"}}, {"X-Webhook-Secret": "whsec"}) == 200)
    check("completed webhook ok", post(f"{APP}/api/webhooks/docuseal", {"event_type": "submission.completed", "data": {"id": sub_id}}, {"X-Webhook-Secret": "whsec"}) == 200)
    emails = open("/tmp/mock-out/emails.log").read(); print(emails)
    check("no countersign email", "Ready to countersign" not in emails)
    check("both get the signed PDF", emails.count("(signed).pdf") == 2)
    inv = open("/tmp/mock-out/email-1.html").read()
    check("invite has the short wording", "If anything needs changing" in inv and "two minutes" not in inv)
    pg.goto(f"{APP}/sign/{slug}/done")
    check("thank-you says complete", "now complete" in pg.inner_text("main"))
    b.close()
print(f"{sum(results)}/{len(results)} passed"); sys.exit(0 if all(results) else 1)
