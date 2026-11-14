// A stand-in for the DocuSeal API, for local testing only.
// Usage: node tests/mock-docuseal.mjs 4010 /tmp/mock-out
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] || 4010);
const outDir = process.argv[3] || "/tmp/mock-docuseal";
fs.mkdirSync(outDir, { recursive: true });

let nextSub = 1001;
let nextSigner = 1;
const subs = new Map();
const rnd = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let body = "";
  for await (const chunk of req) body += chunk;
  fs.appendFileSync(path.join(outDir, "requests.log"), `${req.method} ${url.pathname}${url.search} token=${req.headers["x-auth-token"] ? "yes" : "no"}\n`);

  if (url.pathname === "/signed.pdf") {
    res.writeHead(200, { "Content-Type": "application/pdf" });
    return res.end("%PDF-1.4 mock");
  }
  if (req.method === "POST" && url.pathname === "/emails") {
    const e = JSON.parse(body);
    const n = fs.readdirSync(outDir).filter((f) => f.startsWith("email-")).length + 1;
    fs.writeFileSync(path.join(outDir, `email-${n}.html`), e.html);
    fs.appendFileSync(path.join(outDir, "emails.log"), `${n}: to=${e.to} subject=${e.subject} attachments=${(e.attachments || []).map((a) => a.filename).join(",")}\n`);
    return json(res, 200, { id: `email_${n}` });
  }
  if (!req.headers["x-auth-token"]) return json(res, 401, { error: "Not authenticated" });

  if (req.method === "POST" && url.pathname === "/submissions/html") {
    const data = JSON.parse(body);
    fs.writeFileSync(path.join(outDir, "last-html.html"), data.documents[0].html);
    fs.writeFileSync(path.join(outDir, "last-request.json"), JSON.stringify({ ...data, documents: [{ ...data.documents[0], html: "(saved separately)" }] }, null, 2));
    const id = nextSub++;
    const submitters = data.submitters.map((s) => ({
      id: nextSigner++, submission_id: id, slug: rnd(), uuid: rnd(), email: s.email, name: s.name, role: s.role,
      status: "awaiting", sent_at: null, opened_at: null, completed_at: null, declined_at: null,
      external_id: s.external_id, metadata: s.metadata || {}, values: [], documents: [], preferences: {},
    }));
    subs.set(id, { id, name: data.name, slug: rnd(), status: "pending", created_at: now(), completed_at: null, archived_at: null,
      audit_log_url: null, combined_document_url: null, submitters, documents: [] });
    return json(res, 200, { id, name: data.name, submitters, status: "pending", created_at: now() });
  }

  // Test helper: mark a signer as signed.
  if (req.method === "POST" && url.pathname === "/_test/complete") {
    const { submission_id, role } = JSON.parse(body);
    const s = subs.get(submission_id);
    const signer = s.submitters.find((x) => x.role === role);
    signer.status = "completed"; signer.completed_at = now();
    if (s.submitters.every((x) => x.status === "completed")) {
      s.status = "completed"; s.completed_at = now();
      s.combined_document_url = `http://localhost:${port}/signed.pdf`;
      s.audit_log_url = `http://localhost:${port}/signed.pdf`;
    }
    return json(res, 200, s);
  }

  if (req.method === "GET" && url.pathname === "/submissions") {
    const status = url.searchParams.get("status");
    const data = [...subs.values()].filter((s) => !s.archived_at && (!status || s.status === status)).reverse();
    return json(res, 200, { data, pagination: { count: data.length } });
  }
  const m = url.pathname.match(/^\/submissions\/(\d+)$/);
  if (m) {
    const s = subs.get(Number(m[1]));
    if (!s) return json(res, 404, { error: "Not found" });
    if (req.method === "DELETE") { s.archived_at = now(); return json(res, 200, { id: s.id, archived_at: s.archived_at }); }
    return json(res, 200, s);
  }
  if (req.method === "GET" && url.pathname === "/submitters") {
    const slug = url.searchParams.get("slug");
    const sid = url.searchParams.get("submission_id");
    const all = [...subs.values()].flatMap((s) => s.submitters);
    const data = all.filter((x) => (slug ? x.slug === slug : true) && (sid ? x.submission_id === Number(sid) : true));
    return json(res, 200, { data, pagination: {} });
  }
  json(res, 404, { error: "Unknown route" });
});

server.listen(port, () => console.log(`mock docuseal on ${port}`));
