# End-to-end check against the local app and the mock DocuSeal.
# Run: python3 tests/e2e.py
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright

APP = "http://localhost:3100"
MOCK = "http://localhost:4010"
OUT = "/tmp/e2e-shots"
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def post(url, body, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    page.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    page.route("**/cdn.docuseal.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body="/* stub */"))

    # Login
    page.goto(APP + "/admin")
    check("redirects to login", "/admin/login" in page.url)
    page.fill("input[name=password]", "wrong")
    page.click("button[type=submit]")
    page.wait_for_selector(".err")
    check("wrong password rejected", "not right" in page.inner_text(".err"))
    page.fill("input[name=password]", "test-password-123")
    page.click("button[type=submit]")
    page.wait_for_url(APP + "/admin")
    check("logged in to list", "Awaiting signature" in page.inner_text("h1"))

    # New agreement: submit empty first
    page.goto(APP + "/admin/new")
    page.click("button[value=email]")
    page.wait_for_selector(".notice.error")
    check("empty form shows errors", page.locator(".field.has-error").count() >= 3, str(page.locator(".field.has-error").count()))

    def fill(label, value, nth=0):
        page.get_by_label(label, exact=True).nth(nth).fill(value)

    fill("Full name", "James Carter")
    fill("Email", "james@example.com")
    fill("Telephone", "+44 7700 900000")
    fill("Address", "1 High Street, London")
    fill("Make", "Rolex"); fill("Model", "Datejust 36"); fill("Reference", "16234"); fill("Year", "c1991")
    fill("Insured Value (£)", "8500"); fill("Box and papers", "Box, guarantee papers")
    page.click("text=+ Add another watch")
    fill("Make", "Omega", 1); fill("Model", "Speedmaster Professional", 1); fill("Reference", "145.022", 1)
    page.click("button:has-text('Percentage with minimum return')")
    fill("Minimum return (£)", "7000")
    check("live wording updates", "not less than £7,000" in page.inner_text(".wording .v"))
    page.click("text=Preview the form")
    page.wait_for_selector("iframe.preview-frame")
    frame = page.frame_locator("iframe.preview-frame")
    check("preview renders", "Consignment Form" in frame.locator("h1").inner_text())
    page.screenshot(path=f"{OUT}/1-new-form.png", full_page=True)
    page.wait_for_timeout(800)  # a full-page screenshot briefly resizes the window
    page.locator("button[value=email]").scroll_into_view_if_needed()
    page.locator("button[value=email]").click()
    try:
        page.wait_for_url("**/admin/agreements/**", timeout=15000)
    except Exception:
        page.screenshot(path=f"{OUT}/debug-submit.png", full_page=True)
        open("/tmp/payload.json","w").write(page.locator("input[name=payload]").get_attribute("value"))
        print("DEBUG notices:", page.locator(".notice").all_inner_texts(), page.locator(".err").all_inner_texts())
        raise
    check("agreement page after create", "James Carter" in page.inner_text("h1"))
    check("email sent note", "has been sent" in page.inner_text("body"))
    page.screenshot(path=f"{OUT}/2-agreement.png", full_page=True)
    sub_id = int(page.url.split("/admin/agreements/")[1].split("?")[0])

    req = json.load(open("/tmp/mock-out/last-request.json"))
    check("two signers, preserved order, no DocuSeal emails",
          [s["role"] for s in req["submitters"]] == ["Consignor", "Company"] and req["order"] == "preserved" and req["send_email"] is False)
    html = open("/tmp/mock-out/last-html.html").read()
    check("HTML contains both watches", "Speedmaster Professional" in html and "Datejust 36" in html)

    # Signing page (public)
    cons = next(s for s in req["submitters"] if s["role"] == "Consignor")
    status, body = 0, ""
    with urllib.request.urlopen(f"{MOCK}/submitters?submission_id={sub_id}", timeout=5) if False else urllib.request.urlopen(urllib.request.Request(f"{MOCK}/submitters?submission_id={sub_id}", headers={"X-Auth-Token": "t"})) as r:
        signers = json.load(r)["data"]
    cslug = next(s["slug"] for s in signers if s["role"] == "Consignor")
    kslug = next(s["slug"] for s in signers if s["role"] == "Company")
    pub = browser.new_page(viewport={"width": 1280, "height": 900})
    pub.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    pub.route("**/cdn.docuseal.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body="/* stub */"))
    pub.goto(f"{APP}/sign/{cslug}")
    check("consignor signing page loads", "Your consignment agreement" in pub.inner_text("h1"))
    check("signing box embedded", pub.locator("docuseal-form").count() == 1 and cslug in (pub.locator("docuseal-form").get_attribute("data-src") or ""))
    check("summary shows minimum return", "minimum return £7,000" in pub.inner_text(".summary-grid"))
    pub.screenshot(path=f"{OUT}/3-sign-page.png", full_page=True)
    pub.set_viewport_size({"width": 390, "height": 844})
    pub.screenshot(path=f"{OUT}/3b-sign-page-phone.png", full_page=True)

    pub.goto(f"{APP}/sign/{kslug}")
    check("company page needs login", "/admin/login" in pub.url)
    pub.goto(f"{APP}/sign/notarealslug123")
    check("unknown slug is 404", "404" in pub.content() or "could not be found" in pub.content().lower())

    # Webhooks
    st, _ = post(f"{APP}/api/webhooks/docuseal", {"event_type": "form.completed"})
    check("webhook rejects missing secret", st == 401, str(st))
    post(f"{MOCK}/_test/complete", {"submission_id": sub_id, "role": "Consignor"}, {"X-Auth-Token": "t"})
    st, _ = post(f"{APP}/api/webhooks/docuseal", {"event_type": "form.completed", "data": {"submission_id": sub_id, "role": "Consignor"}}, {"X-Webhook-Secret": "whsec"})
    check("consignor-signed webhook ok", st == 200, str(st))
    page.goto(f"{APP}/admin/agreements/{sub_id}")
    check("countersign button appears", page.locator("text=Countersign now").count() == 1)
    page.goto(f"{APP}/sign/{kslug}")
    check("company signing page loads when logged in", "Countersign the agreement" in page.inner_text("h1"))
    post(f"{MOCK}/_test/complete", {"submission_id": sub_id, "role": "Company"}, {"X-Auth-Token": "t"})
    st, _ = post(f"{APP}/api/webhooks/docuseal", {"event_type": "submission.completed", "data": {"id": sub_id}}, {"X-Webhook-Secret": "whsec"})
    check("completed webhook ok", st == 200, str(st))
    page.goto(f"{APP}/admin?view=signed")
    check("appears under Signed", "James Carter" in page.inner_text("table"))
    page.screenshot(path=f"{OUT}/4-signed-list.png", full_page=True)

    emails = open("/tmp/mock-out/emails.log").read()
    print(emails)
    check("invite email sent", "subject=Your consignment agreement for the 2 watches" in emails)
    check("countersign email sent", "Ready to countersign" in emails)
    check("completed copies with PDF attached", emails.count("(signed).pdf") == 2)

    # In-person flow + cancel
    page.goto(APP + "/admin/new")
    fill("Full name", "Sarah Lee"); fill("Email", "sarah@example.com"); fill("Make", "Cartier"); fill("Model", "Tank Louis")
    page.click("button[value=in-person]")
    page.wait_for_url("**/sign/**")
    check("in-person goes straight to signing", "Your consignment agreement" in page.inner_text("h1"))
    page.goto(APP + "/admin")
    page.click("text=Sarah Lee")
    page.wait_for_url("**/admin/agreements/**")
    page.once("dialog", lambda d: d.accept())
    page.click("text=Cancel this agreement")
    page.wait_for_url("**/admin?cancelled=1")
    check("cancel removes from list", "Sarah Lee" not in page.inner_text("main"))

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
