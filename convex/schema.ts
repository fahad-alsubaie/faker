import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    code: v.string(),
    hostId: v.optional(v.id("players")),
    status: v.union(
      v.literal("lobby"),
      v.literal("setup"),
      v.literal("answering"),
      v.literal("voting"),
      v.literal("results"),
      v.literal("finished"),
    ),
    currentRoundIndex: v.number(),
    maxRounds: v.number(),
    createdAt: v.number(),
    lastActivityAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    isHost: v.boolean(),
    score: v.number(),
    connected: v.boolean(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_name", ["gameId", "name"]),

  personalQuestions: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    questionText: v.string(),
    realAnswer: v.optional(v.string()),
    usedInRound: v.boolean(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_player", ["gameId", "playerId"])
    .index("by_game_used", ["gameId", "usedInRound"]),

  rounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    targetPlayerId: v.id("players"),
    personalQuestionId: v.id("personalQuestions"),
    status: v.union(
      v.literal("answering"),
      v.literal("voting"),
      v.literal("results"),
    ),
    fakeAnswers: v.record(v.string(), v.string()),
    allAnswersShuffled: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        authorId: v.optional(v.id("players")),
        isReal: v.boolean(),
      }),
    ),
    votes: v.record(v.string(), v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_round", ["gameId", "roundNumber"]),
});
