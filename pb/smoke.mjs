#!/usr/bin/env node
// Smoke-tests the API rules by playing a 2-player game via raw REST calls.
// Usage: node pb/smoke.mjs <PB_URL>

const base = (process.argv[2] || "http://127.0.0.1:8090").replace(/\/+$/, "");
let passed = 0, failed = 0;

async function req(method, path, body, token, expectOk = true, label = "") {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok;
  if (ok === expectOk) { passed++; console.log(`  ok: ${label}`); }
  else { failed++; console.log(`  FAIL (${ok ? "unexpected success" : res.status + " " + JSON.stringify(json)}): ${label}`); }
  return json;
}

const rnd = () => Math.random().toString(36).slice(2, 12);
const password = "pw-" + rnd() + "0000";

console.log("== signup: host (isHost=true, no game) ==");
const host = await req("POST", "/api/collections/players/records", {
  name: "أحمد", username: "u" + rnd(), password, passwordConfirm: password,
  isHost: true, game: "", connected: true,
}, undefined, true, "host signup allowed");
const hostTok = (await req("POST", "/api/collections/players/auth-with-password", {
  identity: host.username, password,
}, undefined, true, "host auth")).token;

console.log("== games ==");
await req("POST", "/api/collections/games/records", { code: "8" + rnd().slice(0, 5), status: "lobby", currentRoundIndex: 0, maxRounds: 0 }, "BAD", false, "game create requires auth");
const code = "9" + String(Math.floor(Math.random() * 899999 + 100000)).slice(0, 5);
const game = await req("POST", "/api/collections/games/records", { code, status: "lobby", currentRoundIndex: 0, maxRounds: 0 }, hostTok, true, "host creates game");
await req("PATCH", `/api/collections/players/records/${host.id}`, { game: game.id }, hostTok, true, "host claims game");

console.log("== joiner ==");
await req("POST", "/api/collections/players/records", {
  name: "سارة", username: "u" + rnd(), password, passwordConfirm: password,
  isHost: true, game: game.id, connected: true,
}, undefined, false, "fake host in existing game rejected");
const joiner = await req("POST", "/api/collections/players/records", {
  name: "سارة", username: "u" + rnd(), password, passwordConfirm: password,
  isHost: false, game: game.id, connected: true,
}, undefined, true, "joiner signup");
const joinerTok = (await req("POST", "/api/collections/players/auth-with-password", {
  identity: joiner.username, password,
}, undefined, true, "joiner auth")).token;
await req("PATCH", `/api/collections/players/records/${joiner.id}`, { game: game.id }, joinerTok, false, "joiner cannot change own game");
await req("PATCH", `/api/collections/players/records/${joiner.id}`, { isHost: true }, joinerTok, false, "joiner cannot become host");
await req("PATCH", `/api/collections/players/records/${joiner.id}`, { connected: false }, joinerTok, true, "joiner heartbeat ok");

console.log("== start game ==");
await req("POST", "/api/collections/personalQuestions/records", { game: game.id, player: joiner.id, questionText: "ما هو لونك المفضل؟", usedInRound: false }, joinerTok, false, "joiner cannot create questions");
const q1 = await req("POST", "/api/collections/personalQuestions/records", { game: game.id, player: host.id, questionText: "ما هو أكلك المفضل؟", usedInRound: false }, hostTok, true, "host creates own question");
const q2 = await req("POST", "/api/collections/personalQuestions/records", { game: game.id, player: joiner.id, questionText: "ما هي مدينتك المفضلة؟", usedInRound: false }, hostTok, true, "host creates joiner question");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "setup", maxRounds: 2 }, joinerTok, false, "joiner cannot start game");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "setup", maxRounds: 2 }, hostTok, true, "host starts game");

console.log("== setup answers ==");
await req("POST", "/api/collections/personalAnswers/records", { question: q1.id, player: host.id, text: "الكبسة" }, hostTok, true, "host answers own question");
await req("POST", "/api/collections/personalAnswers/records", { question: q1.id, player: joiner.id, text: "قرصان" }, joinerTok, false, "cannot answer someone else's question");
const pa2 = await req("POST", "/api/collections/personalAnswers/records", { question: q2.id, player: joiner.id, text: "جدة" }, joinerTok, true, "joiner answers own question");
const visibleToJoiner = await req("GET", "/api/collections/personalAnswers/records?filter=" + encodeURIComponent(`question.game="${game.id}"`), undefined, joinerTok, true, "joiner lists personalAnswers");
if (visibleToJoiner.items.length === 1 && visibleToJoiner.items[0].id === pa2.id) { passed++; console.log("  ok: joiner sees only own setup answer"); }
else { failed++; console.log(`  FAIL: joiner saw ${visibleToJoiner.items.length} answers during setup`); }
await req("PATCH", `/api/collections/personalQuestions/records/${q1.id}`, { answeredAt: new Date().toISOString().replace("T", " ") }, hostTok, true, "host marks question answered");
await req("PATCH", `/api/collections/personalQuestions/records/${q2.id}`, { answeredAt: new Date().toISOString().replace("T", " ") }, joinerTok, true, "joiner marks question answered");

console.log("== round 1 ==");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "answering" }, hostTok, true, "host sets answering");
const round1 = await req("POST", "/api/collections/rounds/records", { game: game.id, roundNumber: 1, targetPlayer: host.id, personalQuestion: q1.id, status: "answering" }, hostTok, true, "host creates round 1");
await req("POST", "/api/collections/rounds/records", { game: game.id, roundNumber: 1, targetPlayer: host.id, personalQuestion: q1.id, status: "answering" }, hostTok, false, "duplicate round rejected (unique index)");
await req("PATCH", `/api/collections/rounds/records/${round1.id}`, { roundNumber: 5 }, hostTok, false, "round roundNumber immutable");
const realAns = await req("POST", "/api/collections/answers/records", { round: round1.id, player: host.id, text: "الكبسة", isReal: true }, hostTok, true, "host creates real answer row");
await req("POST", "/api/collections/answers/records", { round: round1.id, player: joiner.id, text: "مقلقل", isReal: false }, joinerTok, true, "joiner submits bluff");
await req("POST", "/api/collections/answers/records", { round: round1.id, player: host.id, text: "شاورما", isReal: false }, hostTok, false, "subject cannot bluff in own round");
await req("POST", "/api/collections/answers/records", { round: round1.id, player: joiner.id, text: "برياني", isReal: false }, joinerTok, false, "second bluff by same player rejected (round moved to voting? no - visible only)... actually allowed by rules, engine dedupes");
const ansVisibleToHost = await req("GET", "/api/collections/answers/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "host lists answers during answering");
if (ansVisibleToHost.items.length === 1 && ansVisibleToHost.items[0].id === realAns.id) { passed++; console.log("  ok: subject sees only real answer row during answering"); }
else { failed++; console.log(`  FAIL: subject saw ${ansVisibleToHost.items.length} answers during answering`); }

console.log("== voting ==");
await req("PATCH", `/api/collections/rounds/records/${round1.id}`, { status: "voting" }, joinerTok, true, "any player flips round to voting");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "voting" }, hostTok, true, "game to voting");
const bluffs = (await req("GET", "/api/collections/answers/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, joinerTok, true, "joiner sees all answers at voting")).items;
const ownBluff = bluffs.find((a) => !a.isReal);
await req("POST", "/api/collections/votes/records", { round: round1.id, voter: joiner.id, answer: ownBluff.id }, joinerTok, false, "cannot vote own bluff");
await req("POST", "/api/collections/votes/records", { round: round1.id, voter: joiner.id, answer: realAns.id }, joinerTok, true, "joiner votes real answer");
const votesDuringVoting = await req("GET", "/api/collections/votes/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "host lists votes during voting");
if (votesDuringVoting.items.length === 0) { passed++; console.log("  ok: votes hidden from others during voting"); }
else { failed++; console.log(`  FAIL: votes leaked during voting (${votesDuringVoting.items.length})`); }

console.log("== results ==");
await req("PATCH", `/api/collections/rounds/records/${round1.id}`, { status: "results" }, joinerTok, true, "round to results");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "results" }, hostTok, true, "game to results");
const votesAtResults = await req("GET", "/api/collections/votes/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "votes visible at results");
if (votesAtResults.items.length === 1) { passed++; console.log("  ok: votes visible at results"); }
else { failed++; console.log("  FAIL: votes not visible at results"); }

console.log("== reset (ordered plain deletes, no cascade dependency) ==");
await req("DELETE", `/api/collections/rounds/records/${round1.id}`, undefined, joinerTok, false, "joiner cannot delete round");
const voteIds = (await req("GET", "/api/collections/votes/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "fetch votes for cleanup")).items.map(v => v.id);
await req("DELETE", `/api/collections/votes/records/${voteIds[0]}`, undefined, joinerTok, false, "joiner cannot delete vote");
await req("DELETE", `/api/collections/votes/records/${voteIds[0]}`, undefined, hostTok, true, "host deletes vote");
for (const a of (await req("GET", "/api/collections/answers/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "fetch answers for cleanup")).items) {
  await req("DELETE", `/api/collections/answers/records/${a.id}`, undefined, hostTok, true, "host deletes answer");
}
await req("DELETE", `/api/collections/rounds/records/${round1.id}`, undefined, hostTok, true, "host deletes round");
const cascaded = await req("GET", "/api/collections/answers/records?filter=" + encodeURIComponent(`round="${round1.id}"`), undefined, hostTok, true, "leftover check");
if (cascaded.items.length === 0) { passed++; console.log("  ok: no answers left after reset"); }
else { failed++; console.log("  FAIL: answers left after reset"); }
for (const pa of (await req("GET", "/api/collections/personalAnswers/records?filter=" + encodeURIComponent(`question.game="${game.id}"`), undefined, hostTok, true, "fetch personalAnswers for cleanup")).items) {
  await req("DELETE", `/api/collections/personalAnswers/records/${pa.id}`, undefined, hostTok, true, "host deletes personalAnswer");
}
await req("DELETE", `/api/collections/personalQuestions/records/${q1.id}`, undefined, hostTok, true, "host deletes question");
await req("PATCH", `/api/collections/games/records/${game.id}`, { status: "lobby", currentRoundIndex: 0, maxRounds: 0 }, hostTok, true, "host resets game");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
