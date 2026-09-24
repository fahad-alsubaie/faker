import { pb, signUpPlayer } from "./pb";
import type {
  AnswerRecord,
  GameRecord,
  PersonalAnswerRecord,
  PersonalQuestionRecord,
  PlayerRecord,
  RoundRecord,
  VoteRecord,
} from "./types";

export const QUESTIONS_PER_PLAYER = 1;

export const ARABIC_QUESTIONS = [
  "ما هو مطربك المفضل؟",
  "أي مدينة تحب تزورها؟",
  "ما هو أكلك المفضل؟",
  "ما هي هوايتك المفضلة؟",
  "ما هو فيلمك المفضل؟",
  "ما هي لغتك المفضلة؟",
  "ما هو لونك المفضل؟",
  "ما هي وجهتك السفر القادمة؟",
  "ما هو هاتفك الحالي؟",
  "ما هي وجبتك المفضلة؟",
  "ما هو مشروبك المفضل؟",
  "ما هي رياضتك المفضلة؟",
  "ما هو برنامجك التلفزيوني المفضل؟",
  "ما هي سيارتك المفضلة؟",
  "ما هو وظيفتك المستقبلية المفضلة؟",
  "ما هي فاكهتك المفضلة؟",
  "ما هو كتابك المفضل؟",
  "ما هي لعبتك المفضلة؟",
  "ما هو موسمك المفضل؟",
  "ما هي حيوانك المفضل؟",
];

export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortAnswers(answers: AnswerRecord[]): AnswerRecord[] {
  return [...answers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function orderPlayers(players: PlayerRecord[]): PlayerRecord[] {
  return [...players].sort(
    (a, b) =>
      new Date(a.created).getTime() - new Date(b.created).getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function nowString(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function myPlayer(): PlayerRecord | null {
  const rec = pb.authStore.record;
  if (!rec || rec.collectionName !== "players") return null;
  return rec as unknown as PlayerRecord;
}

async function getGameByCode(code: string): Promise<GameRecord | null> {
  const list = await pb.collection("games").getFullList<GameRecord>({
    filter: `code = "${code}"`,
  });
  return list[0] ?? null;
}

export async function listPlayers(gameId: string): Promise<PlayerRecord[]> {
  return pb.collection("players").getFullList<PlayerRecord>({
    filter: `game = "${gameId}"`,
    sort: "created,id",
  });
}

export async function createGame(hostName: string) {
  const { record: host, username, password } = await signUpPlayer({ name: hostName, isHost: true });

  let game: GameRecord | undefined;
  for (let i = 0; i < 20 && !game; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      game = await pb.collection("games").create<GameRecord>({ code, status: "lobby" });
    } catch {
      // duplicate code, retry
    }
  }
  if (!game) throw new GameError("code-gen", "تعذر إنشاء كود اللعبة، حاول مرة أخرى");

  await pb.collection("players").update(host.id, { game: game.id });
  return { gameId: game.id, playerId: host.id, code: game.code, username, password };
}

export async function joinGame(code: string, playerName: string) {
  const game = await getGameByCode(code);
  if (!game) throw new GameError("not-found", "اللعبة غير موجودة");
  if (game.status !== "lobby") throw new GameError("started", "اللعبة بدأت بالفعل");

  const { record: player, username, password } = await signUpPlayer({
    name: playerName,
    isHost: false,
    game: game.id,
  });

  try {
    const players = await listPlayers(game.id);
    const dup = players.find(
      (p) => p.id !== player.id && p.name.trim() === playerName.trim(),
    );
    if (dup) throw new GameError("name-taken", "الاسم مستخدم بالفعل في هذه اللعبة");
    if (players.length > 12) throw new GameError("full", "اللعبة ممتلئة (12 لاعباً كحد أقصى)");
  } catch (err) {
    await pb.collection("players").delete(player.id).catch(() => {});
    throw err;
  }

  return { gameId: game.id, playerId: player.id, code: game.code, username, password };
}

export async function startGame(gameId: string) {
  const players = await listPlayers(gameId);
  if (players.length < 2) throw new GameError("need-players", "تحتاج لاعبين على الأقل للبدء");

  for (const player of players) {
    const picks = shuffle(ARABIC_QUESTIONS).slice(0, QUESTIONS_PER_PLAYER);
    for (const questionText of picks) {
      await pb.collection("personalQuestions").create({
        game: gameId,
        player: player.id,
        questionText,
        usedInRound: false,
      });
    }
  }

  await pb.collection("games").update(gameId, {
    status: "setup",
    maxRounds: players.length,
    currentRoundIndex: 0,
    lastActivityAt: nowString(),
  });
}

export async function submitPersonalAnswer(answer: string) {
  const me = myPlayer();
  if (!me) throw new GameError("no-auth", "انتهت الجلسة، أعد الانضمام");

  const questions = await pb
    .collection("personalQuestions")
    .getFullList<PersonalQuestionRecord>({
      filter: `player = "${me.id}" && game = "${me.game}"`,
    });
  const question = questions.find((q) => !q.answeredAt);
  if (!question) throw new GameError("no-question", "لا يوجد سؤال بدون إجابة");

  await pb.collection("personalAnswers").create({
    question: question.id,
    player: me.id,
    text: answer.trim(),
  });
  await pb.collection("personalQuestions").update(question.id, {
    answeredAt: nowString(),
  });
}

async function fetchAnswerMap(
  gameId: string,
): Promise<Map<string, PersonalAnswerRecord>> {
  const answers = await pb.collection("personalAnswers").getFullList<PersonalAnswerRecord>({
    filter: `question.game = "${gameId}"`,
  });
  return new Map(answers.map((a) => [a.question, a]));
}

export async function startRound(gameId: string) {
  const game = await pb.collection("games").getOne<GameRecord>(gameId);
  const players = orderPlayers(await listPlayers(gameId));

  const roundNumber = game.currentRoundIndex + 1;
  const existing = await pb.collection("rounds").getFullList<RoundRecord>({
    filter: `game = "${gameId}" && roundNumber = ${roundNumber}`,
  });
  if (existing.length > 0) return;

  if (game.status === "setup" || game.status === "results") {
    await pb.collection("games").update(gameId, { status: "answering" });
  }

  const questions = await pb
    .collection("personalQuestions")
    .getFullList<PersonalQuestionRecord>({ filter: `game = "${gameId}"` });
  const answerMap = await fetchAnswerMap(gameId);
  const answered = (q: PersonalQuestionRecord) => {
    const a = answerMap.get(q.id);
    return !!a && a.text.trim() !== "";
  };

  const subject = players[game.currentRoundIndex % players.length];
  let target = questions.find(
    (q) => q.player === subject.id && !q.usedInRound && answered(q),
  );
  if (!target) {
    target = questions.find((q) => !q.usedInRound && answered(q));
  }
  if (!target) {
    await pb.collection("games").update(gameId, { status: "finished" });
    return;
  }

  const round = await pb.collection("rounds").create<RoundRecord>({
    game: gameId,
    roundNumber,
    targetPlayer: target.player,
    personalQuestion: target.id,
    status: "answering",
  });

  await pb.collection("answers").create({
    round: round.id,
    player: target.player,
    text: answerMap.get(target.id)!.text,
    isReal: true,
  });

  await pb.collection("personalQuestions").update(target.id, { usedInRound: true });
  await pb.collection("games").update(gameId, { lastActivityAt: nowString() });
}

export async function submitBluff(round: RoundRecord, text: string) {
  const me = myPlayer();
  if (!me) throw new GameError("no-auth", "انتهت الجلسة، أعد الانضمام");
  const trimmed = text.trim();
  if (!trimmed) throw new GameError("empty", "الإجابة فارغة");

  const mine = await pb.collection("answers").getFullList<AnswerRecord>({
    filter: `round = "${round.id}" && player = "${me.id}"`,
  });
  if (mine.length > 0) throw new GameError("dup", "already-submitted");

  await pb.collection("answers").create({
    round: round.id,
    player: me.id,
    text: trimmed,
    isReal: false,
  });
  await pb.collection("players").update(me.id, { bluffedRound: round.id });
  await maybeToVoting(round.id).catch(() => {});
}

export async function maybeToVoting(roundId: string) {
  const round = await pb.collection("rounds").getOne<RoundRecord>(roundId);
  if (round.status !== "answering") return;

  const players = await listPlayers(round.game);
  const bluffed = players.filter((p) => p.bluffedRound === round.id && p.id !== round.targetPlayer);
  if (bluffed.length < players.length - 1) return;

  await pb.collection("rounds").update(round.id, { status: "voting" });
  await pb.collection("games").update(round.game, {
    status: "voting",
    lastActivityAt: nowString(),
  });
}

export async function submitVote(round: RoundRecord, answerId: string) {
  const me = myPlayer();
  if (!me) throw new GameError("no-auth", "انتهت الجلسة، أعد الانضمام");

  const existing = await pb.collection("votes").getFullList<VoteRecord>({
    filter: `round = "${round.id}" && voter = "${me.id}"`,
  });
  if (existing.length > 0) return;

  await pb.collection("votes").create({
    round: round.id,
    voter: me.id,
    answer: answerId,
  });
  await pb.collection("players").update(me.id, { votedRound: round.id });
  await maybeToResults(round.id).catch(() => {});
}

export async function maybeToResults(roundId: string) {
  const round = await pb.collection("rounds").getOne<RoundRecord>(roundId);
  if (round.status !== "voting") return;

  const players = await listPlayers(round.game);
  const voted = players.filter((p) => p.votedRound === round.id && p.id !== round.targetPlayer);
  if (voted.length < players.length - 1) return;

  await pb.collection("rounds").update(round.id, { status: "results" });
  await pb.collection("games").update(round.game, {
    status: "results",
    lastActivityAt: nowString(),
  });
}

export async function advanceRound(game: GameRecord) {
  if (game.currentRoundIndex + 1 >= game.maxRounds) {
    await pb.collection("games").update(game.id, { status: "finished" });
    return;
  }
  await pb.collection("games").update(game.id, {
    currentRoundIndex: game.currentRoundIndex + 1,
    status: "answering",
    lastActivityAt: nowString(),
  });
  await startRound(game.id);
}

export async function resetGame(gameId: string) {
  const rounds = await pb.collection("rounds").getFullList<RoundRecord>({
    filter: `game = "${gameId}"`,
  });
  for (const round of rounds) {
    const votes = await pb.collection("votes").getFullList<VoteRecord>({
      filter: `round = "${round.id}"`,
    });
    for (const v of votes) {
      await pb.collection("votes").delete(v.id).catch(() => {});
    }
    const answers = await pb.collection("answers").getFullList<AnswerRecord>({
      filter: `round = "${round.id}"`,
    });
    for (const a of answers) {
      await pb.collection("answers").delete(a.id).catch(() => {});
    }
    await pb.collection("rounds").delete(round.id).catch(() => {});
  }

  const questions = await pb
    .collection("personalQuestions")
    .getFullList<PersonalQuestionRecord>({ filter: `game = "${gameId}"` });
  for (const q of questions) {
    const personalAnswers = await pb
      .collection("personalAnswers")
      .getFullList<PersonalAnswerRecord>({ filter: `question = "${q.id}"` });
    for (const pa of personalAnswers) {
      await pb.collection("personalAnswers").delete(pa.id).catch(() => {});
    }
    await pb.collection("personalQuestions").delete(q.id).catch(() => {});
  }

  await pb.collection("games").update(gameId, {
    status: "lobby",
    currentRoundIndex: 0,
    maxRounds: 0,
    lastActivityAt: nowString(),
  });
}

export function computeScores(
  players: PlayerRecord[],
  rounds: RoundRecord[],
  answers: AnswerRecord[],
  votes: VoteRecord[],
): Map<string, number> {
  const scores = new Map<string, number>(players.map((p) => [p.id, 0]));
  const answerById = new Map(answers.map((a) => [a.id, a]));
  const finishedRounds = rounds.filter((r) => r.status === "results");

  for (const vote of votes) {
    const round = finishedRounds.find((r) => r.id === vote.round);
    if (!round) continue;
    const answer = answerById.get(vote.answer);
    if (!answer) continue;
    if (answer.isReal) {
      scores.set(vote.voter, (scores.get(vote.voter) ?? 0) + 100);
    } else {
      scores.set(answer.player, (scores.get(answer.player) ?? 0) + 100);
    }
  }
  return scores;
}
