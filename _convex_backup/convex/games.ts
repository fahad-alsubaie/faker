import { v } from "convex/values";
import { query, mutation, internalMutation, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { QUESTIONS_PER_PLAYER, ARABIC_QUESTIONS, shuffle } from "./questions";

const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export async function touchGame(ctx: MutationCtx, gameId: Id<"games">) {
  await ctx.db.patch(gameId, { lastActivityAt: Date.now() });
}

export async function findGameByCode(ctx: QueryCtx, code: string) {
  const matches = await ctx.db
    .query("games")
    .withIndex("by_code", (q) => q.eq("code", code))
    .collect();
  if (matches.length === 0) return null;
  const lobby = matches.find((g) => g.status === "lobby");
  if (lobby) return lobby;
  return [...matches].sort((a, b) => a._creationTime - b._creationTime).at(-1)!;
}

async function generateUniqueCode(ctx: MutationCtx) {
  for (let i = 0; i < 20; i++) {
    const code = generateCode();
    const existing = await findGameByCode(ctx, code);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique game code");
}

const GAME_CLEANUP_DELAY_MS = 10 * 60 * 1000;

export const createGame = mutation({
  args: {
    hostName: v.string(),
  },
  returns: v.object({
    gameId: v.id("games"),
    playerId: v.id("players"),
    code: v.string(),
  }),
  handler: async (ctx, args) => {
    const code = await generateUniqueCode(ctx);
    const now = Date.now();

    const gameId = await ctx.db.insert("games", {
      code,
      status: "lobby",
      currentRoundIndex: 0,
      maxRounds: 0,
      createdAt: now,
      lastActivityAt: now,
    });

    const playerId = await ctx.db.insert("players", {
      gameId,
      name: args.hostName.trim(),
      isHost: true,
      score: 0,
      connected: true,
    });

    await ctx.db.patch(gameId, { hostId: playerId });

    return { gameId, playerId, code };
  },
});

export const getGameByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code);
    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    return { game, players };
  },
});

export const getGameById = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    return { game, players };
  },
});

export const startGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    if (players.length < 2) {
      throw new Error("Need at least 2 players");
    }

    for (const player of players) {
      const picks = shuffle(ARABIC_QUESTIONS).slice(0, QUESTIONS_PER_PLAYER);
      for (const questionText of picks) {
        await ctx.db.insert("personalQuestions", {
          gameId: args.gameId,
          playerId: player._id,
          questionText,
          usedInRound: false,
        });
      }
    }

    await ctx.db.patch(args.gameId, {
      status: "setup",
      maxRounds: players.length,
      currentRoundIndex: 0,
      lastActivityAt: Date.now(),
    });
  },
});

export const startRound = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const ordered = [...players].sort(
      (a, b) => a._creationTime - b._creationTime || (a._id < b._id ? -1 : 1),
    );
    const subject = ordered[game.currentRoundIndex % ordered.length];

    const roundNumber = game.currentRoundIndex + 1;
    const existingRound = await ctx.db
      .query("rounds")
      .withIndex("by_game_round", (q) =>
        q.eq("gameId", args.gameId).eq("roundNumber", roundNumber),
      )
      .first();
    if (existingRound) return;

    const subjectQuestions = await ctx.db
      .query("personalQuestions")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", args.gameId).eq("playerId", subject._id),
      )
      .collect();

    const usable = subjectQuestions.filter(
      (q) => q.realAnswer !== undefined && !q.usedInRound,
    );

    let targetQuestion;
    if (usable.length > 0) {
      targetQuestion = usable[Math.floor(Math.random() * usable.length)];
    } else {
      const anyUnused = await ctx.db
        .query("personalQuestions")
        .withIndex("by_game_used", (q) =>
          q.eq("gameId", args.gameId).eq("usedInRound", false),
        )
        .filter((q) => q.neq(q.field("realAnswer"), undefined))
        .collect();
      if (anyUnused.length === 0) {
        await ctx.db.patch(args.gameId, { status: "finished" });
        await ctx.scheduler.runAfter(
          GAME_CLEANUP_DELAY_MS,
          internal.games.cleanupFinishedGame,
          { gameId: args.gameId },
        );
        return;
      }
      targetQuestion = anyUnused[0];
    }

    await ctx.db.insert("rounds", {
      gameId: args.gameId,
      roundNumber,
      targetPlayerId: targetQuestion.playerId,
      personalQuestionId: targetQuestion._id,
      status: "answering",
      fakeAnswers: {},
      allAnswersShuffled: [],
      votes: {},
    });

    await ctx.db.patch(targetQuestion._id, { usedInRound: true });
    await ctx.db.patch(args.gameId, {
      status: "answering",
      lastActivityAt: Date.now(),
    });
  },
});

export const nextRound = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.currentRoundIndex + 1 >= game.maxRounds) {
      await ctx.db.patch(args.gameId, { status: "finished", lastActivityAt: Date.now() });
      await ctx.scheduler.runAfter(
        GAME_CLEANUP_DELAY_MS,
        internal.games.cleanupFinishedGame,
        { gameId: args.gameId },
      );
      return;
    }

    await ctx.db.patch(args.gameId, {
      currentRoundIndex: game.currentRoundIndex + 1,
      status: "answering",
      lastActivityAt: Date.now(),
    });
  },
});

export const resetGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    await ctx.db.patch(args.gameId, {
      status: "lobby",
      currentRoundIndex: 0,
      maxRounds: 0,
      lastActivityAt: Date.now(),
    });

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    for (const player of players) {
      await ctx.db.patch(player._id, { score: 0 });
    }

    const questions = await ctx.db
      .query("personalQuestions")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const q of questions) {
      await ctx.db.delete(q._id);
    }

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const r of rounds) {
      await ctx.db.delete(r._id);
    }
  },
});

async function deleteGameData(ctx: MutationCtx, gameId: Id<"games">) {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  for (const r of rounds) {
    await ctx.db.delete(r._id);
  }

  const questions = await ctx.db
    .query("personalQuestions")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  for (const q of questions) {
    await ctx.db.delete(q._id);
  }

  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  for (const p of players) {
    await ctx.db.delete(p._id);
  }

  await ctx.db.delete(gameId);
}

export const cleanupFinishedGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "finished") return;
    await deleteGameData(ctx, args.gameId);
  },
});

const STALE_GAME_MS = 30 * 60 * 1000;

export const deleteStaleGames = internalMutation({
  args: { olderThanMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const threshold = args.olderThanMs ?? STALE_GAME_MS;
    const now = Date.now();
    const games = await ctx.db.query("games").collect();
    for (const game of games) {
      const last = game.lastActivityAt ?? game.createdAt;
      if (now - last > threshold) {
        await deleteGameData(ctx, game._id);
      }
    }
  },
});
