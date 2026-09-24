#!/usr/bin/env node
// Provisions the PocketBase collections + API rules for the Faker (فاكر) game.
// Usage: node pb/setup.mjs <PB_URL> <superuser_email> <superuser_password>
// Idempotent: re-running updates collections in place.
//
// PocketBase gotchas baked into this schema:
// - required number/bool fields reject 0/false (treated as blank) -> such fields are optional
// - the "~" rule operator is LIKE/contains, NOT regex -> code format enforced via field pattern

const [pbUrl, email, password] = process.argv.slice(2);
if (!pbUrl || !email || !password) {
  console.error("Usage: node pb/setup.mjs <PB_URL> <superuser_email> <superuser_password>");
  process.exit(1);
}

const base = pbUrl.replace(/\/+$/, "");

async function api(path, method, body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const auth = await api("/api/collections/_superusers/auth-with-password", "POST", {
  identity: email,
  password,
});
const token = auth.token;
console.log(`Authenticated as superuser, provisioning collections on ${base}...`);

const F = {
  text: (name, opts = {}) => ({ name, type: "text", ...opts }),
  number: (name, opts = {}) => ({ name, type: "number", ...opts }),
  bool: (name, opts = {}) => ({ name, type: "bool", ...opts }),
  select: (name, values, opts = {}) => ({
    name,
    type: "select",
    values,
    maxSelect: 1,
    ...opts,
  }),
  relation: (name, collectionId, opts = {}) => ({
    name,
    type: "relation",
    collectionId,
    maxSelect: 1,
    ...opts,
  }),
};

// the raw Admin API does not add system fields automatically (the dashboard does)
const SYSTEM_FIELDS = [
  {
    name: "id",
    type: "text",
    primaryKey: true,
    required: true,
    system: true,
    autogeneratePattern: "[a-z0-9]{15}",
    min: 15,
    max: 15,
    pattern: "^[a-z0-9]+$",
  },
  { name: "created", type: "autodate", onCreate: true, system: true },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true, system: true },
];

const withSystemFields = (def) => ({
  ...def,
  fields: [
    ...SYSTEM_FIELDS,
    ...(def.name === "players"
      ? [{ name: "email", type: "email", required: false, system: false }]
      : []),
    ...def.fields,
  ],
});

const ORDER = ["games", "players", "personalQuestions", "personalAnswers", "rounds", "answers", "votes"];

const defs = (ids) => ({
  games: {
    name: "games",
    type: "base",
    fields: [
      F.text("code", { required: true, min: 6, max: 6, pattern: "^[0-9]{6}$", presentable: true }),
      F.select("status", ["lobby", "setup", "answering", "voting", "results", "finished"], {
        required: true,
      }),
      F.number("currentRoundIndex", { min: 0, onlyInt: true }),
      F.number("maxRounds", { min: 0, onlyInt: true }),
      F.text("lastActivityAt", {}),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_games_code ON games (code)"],
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != "" && @request.body.status = "lobby"',
    updateRule:
      '@request.auth.game = id && @request.body.code:isset = false && (@request.body.status:isset = false || (@request.auth.isHost = true && status = "lobby" && @request.body.status = "setup") || (@request.auth.isHost = true && status = "setup" && @request.body.status = "answering") || (status = "answering" && @request.body.status = "voting") || (status = "voting" && @request.body.status = "results") || (@request.auth.isHost = true && status = "results" && (@request.body.status = "answering" || @request.body.status = "finished")) || (@request.auth.isHost = true && @request.body.status = "lobby"))',
    deleteRule: '@request.auth.isHost = true && @request.auth.game = id',
  },
  players: {
    name: "players",
    type: "auth",
    fields: [
      F.text("name", { required: true, min: 1, max: 30 }),
      F.text("username", { required: true, min: 5, max: 30, pattern: "^[a-z0-9]+$" }),
      F.relation("game", ids.games, {}),
      F.bool("isHost", {}),
      F.bool("connected", {}),
      F.text("bluffedRound", {}),
      F.text("votedRound", {}),
    ],
    indexes: [
      "CREATE INDEX idx_players_game ON players (game)",
      "CREATE UNIQUE INDEX idx_players_username ON players (username)",
    ],
    listRule: '@request.auth.id != "" && (game = @request.auth.game || id = @request.auth.id)',
    viewRule: '@request.auth.id != "" && (game = @request.auth.game || id = @request.auth.id)',
    createRule:
      '(@request.body.isHost = true && @request.body.game = "") || (@request.body.isHost = false && @request.body.game != "" && @request.body.game.status = "lobby")',
    updateRule:
      'id = @request.auth.id && @request.body.isHost:isset = false && @request.body.name:isset = false && (@request.body.game:isset = false || game = "")',
    deleteRule: 'id = @request.auth.id',
    passwordAuth: { enabled: true, identityFields: ["username"] },
  },
  personalQuestions: {
    name: "personalQuestions",
    type: "base",
    fields: [
      F.relation("game", ids.games, { required: true, cascadeDelete: true }),
      F.relation("player", ids.players, { required: true }),
      F.text("questionText", { required: true, min: 1 }),
      F.bool("usedInRound", {}),
      F.text("answeredAt", {}),
    ],
    indexes: [
      "CREATE INDEX idx_pq_game ON personalQuestions (game)",
      "CREATE INDEX idx_pq_player ON personalQuestions (player)",
    ],
    listRule: 'game = @request.auth.game || player = @request.auth.id',
    viewRule: 'game = @request.auth.game || player = @request.auth.id',
    createRule:
      '@request.auth.isHost = true && @request.auth.game = game && player.game = game && @request.body.answeredAt:isset = false && @request.body.usedInRound = false',
    updateRule:
      '(player = @request.auth.id && @request.body.questionText:isset = false && @request.body.usedInRound:isset = false && @request.body.player:isset = false && @request.body.game:isset = false) || (@request.auth.isHost = true && @request.auth.game = game && @request.body.answeredAt:isset = false && @request.body.questionText:isset = false && @request.body.player:isset = false && @request.body.game:isset = false)',
    deleteRule: '@request.auth.isHost = true && @request.auth.game = game',
  },
  personalAnswers: {
    name: "personalAnswers",
    type: "base",
    fields: [
      F.relation("question", ids.personalQuestions, { required: true, cascadeDelete: true }),
      F.relation("player", ids.players, { required: true }),
      F.text("text", { required: true, min: 1 }),
    ],
    indexes: [
      "CREATE INDEX idx_pa_question ON personalAnswers (question)",
      "CREATE INDEX idx_pa_player ON personalAnswers (player)",
    ],
    listRule:
      'player = @request.auth.id || (question.game = @request.auth.game && question.game.status != "lobby" && question.game.status != "setup")',
    viewRule:
      'player = @request.auth.id || (question.game = @request.auth.game && question.game.status != "lobby" && question.game.status != "setup")',
    createRule: 'player = @request.auth.id && question.player = @request.auth.id',
    updateRule: null,
    deleteRule: '@request.auth.isHost = true && @request.auth.game = question.game',
  },
  rounds: {
    name: "rounds",
    type: "base",
    fields: [
      F.relation("game", ids.games, { required: true, cascadeDelete: true }),
      F.number("roundNumber", { required: true, min: 1, onlyInt: true }),
      F.relation("targetPlayer", ids.players, { required: true }),
      F.relation("personalQuestion", ids.personalQuestions, { required: true }),
      F.select("status", ["answering", "voting", "results"], { required: true }),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_rounds_game_round ON rounds (game, roundNumber)",
      "CREATE INDEX idx_rounds_game ON rounds (game)",
    ],
    listRule: 'game = @request.auth.game',
    viewRule: 'game = @request.auth.game',
    createRule: '@request.auth.isHost = true && @request.auth.game = game',
    updateRule:
      'game = @request.auth.game && @request.body.game:isset = false && @request.body.roundNumber:isset = false && @request.body.targetPlayer:isset = false && @request.body.personalQuestion:isset = false && (@request.body.status:isset = false || (status = "answering" && @request.body.status = "voting") || (status = "voting" && @request.body.status = "results"))',
    deleteRule: '@request.auth.isHost = true && @request.auth.game = game',
  },
  answers: {
    name: "answers",
    type: "base",
    fields: [
      F.relation("round", ids.rounds, { required: true, cascadeDelete: true }),
      F.relation("player", ids.players, { required: true }),
      F.text("text", { required: true, min: 1 }),
      F.bool("isReal", {}),
    ],
    indexes: [
      "CREATE INDEX idx_answers_round ON answers (round)",
      "CREATE INDEX idx_answers_player ON answers (player)",
      "CREATE UNIQUE INDEX idx_answers_round_player ON answers (round, player)",
    ],
    listRule: 'player = @request.auth.id || round.status != "answering"',
    viewRule: 'player = @request.auth.id || round.status != "answering"',
    createRule:
      '(round.status = "answering" && round.game = @request.auth.game && player = @request.auth.id && round.targetPlayer != @request.auth.id && isReal = false) || (@request.auth.isHost = true && @request.auth.game = round.game && isReal = true)',
    updateRule:
      'round.game = @request.auth.game && @request.body.round:isset = false && @request.body.player:isset = false && @request.body.text:isset = false && @request.body.isReal:isset = false',
    deleteRule: '@request.auth.isHost = true && @request.auth.game = round.game',
  },
  votes: {
    name: "votes",
    type: "base",
    fields: [
      F.relation("round", ids.rounds, { required: true, cascadeDelete: true }),
      F.relation("voter", ids.players, { required: true }),
      F.relation("answer", ids.answers, { required: true, cascadeDelete: true }),
    ],
    indexes: [
      "CREATE INDEX idx_votes_round ON votes (round)",
      "CREATE INDEX idx_votes_voter ON votes (voter)",
      "CREATE UNIQUE INDEX idx_votes_round_voter ON votes (round, voter)",
    ],
    listRule: 'voter = @request.auth.id || round.status = "results"',
    viewRule: 'voter = @request.auth.id || round.status = "results"',
    createRule:
      'round.status = "voting" && round.game = @request.auth.game && voter = @request.auth.id && round.targetPlayer != @request.auth.id && answer.round = round && answer.player != @request.auth.id',
    updateRule: null,
    deleteRule: '@request.auth.isHost = true && @request.auth.game = round.game',
  },
});

const existing = await api("/api/collections?perPage=200", "GET", undefined, token);
const ids = {};
for (const c of existing.items || []) ids[c.name] = c.id;

for (const name of ORDER) {
  const def = withSystemFields(defs(ids)[name]);
  if (ids[name]) {
    const { name: _n, type: _t, ...patch } = def;
    await api(`/api/collections/${ids[name]}`, "PATCH", patch, token);
    console.log(`updated collection ${name}`);
  } else {
    const created = await api("/api/collections", "POST", def, token);
    ids[name] = created.id;
    console.log(`created collection ${name}`);
  }
}

console.log("Done. Collections provisioned.");
