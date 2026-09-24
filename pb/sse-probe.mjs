// One-shot SSE latency probe against a PocketBase URL.
// Usage: node sse-probe.mjs <pbUrl> <superuserEmail> <superuserPass> <gameCode>
const [base, suEmail, suPass, gameCode] = process.argv.slice(2);
const PocketBase = (await import("pocketbase")).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ac = new AbortController();
  const res = await fetch(`${base}/api/realtime`, { signal: ac.signal });
  console.log("stream status:", res.status, res.headers.get("content-type"));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let clientId = null;
  const t0 = Date.now();
  while (!clientId) {
    const { value, done } = await reader.read();
    if (done) {
      console.log("stream ENDED before PB_CONNECT after", Date.now() - t0, "ms; got:", JSON.stringify(buf.slice(0, 200)));
      process.exit(1);
    }
    buf += dec.decode(value, { stream: true });
    if (buf.includes("PB_CONNECT")) {
      const m = buf.match(/data:(\{.*\})/);
      if (m) clientId = JSON.parse(m[1]).clientId;
    }
  }
  console.log("PB_CONNECT after", Date.now() - t0, "ms");

  const g = (await (await fetch(`${base}/api/collections/games/records?filter=` + encodeURIComponent(`code="${gameCode}"`))).json()).items[0];
  const subKey = `games/${g.id}`;
  const subs = {};
  subs[subKey] = {};
  const subRes = await fetch(`${base}/api/realtime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, subscriptions: [subKey] }),
  });
  console.log("subscribe POST:", subRes.status, (await subRes.text()).slice(0, 120));

  const pb = new PocketBase(base);
  await pb.collection("_superusers").authWithPassword(suEmail, suPass);
  const t1 = Date.now();
  const readLoop = (async () => {
    buf = "";
    let got = false;
    while (Date.now() - t1 < 10000) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (buf.includes(subKey)) {
        got = true;
        console.log("record event arrived after", Date.now() - t1, "ms");
        break;
      }
    }
    if (!got) console.log("NO record event within 10s (buffered or dropped)");
  })();
  const upd = await pb
    .collection("games")
    .update(g.id, { lastActivityAt: new Date().toISOString().replace("T", " ").slice(0, 19) + "Z" });
  console.log("update ok:", upd.id.slice(0, 8));
  await readLoop;
  ac.abort();
  process.exit(0);
})().catch((e) => {
  console.error("probe error:", e.message);
  process.exit(1);
});
