import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { findGameByCode, touchGame } from "./games";

export const joinGame = mutation({
  args: {
    code: v.string(),
    playerName: v.string(),
  },
  returns: v.object({
    gameId: v.id("games"),
    playerId: v.id("players"),
  }),
  handler: async (ctx, args) => {
    const game = await findGameByCode(ctx, args.code);

    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game already started");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    if (players.length >= 12) {
      throw new Error("Game is full");
    }

    const existing = await ctx.db
      .query("players")
      .withIndex("by_game_name", (q) =>
        q.eq("gameId", game._id).eq("name", args.playerName.trim()),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { connected: true });
      await touchGame(ctx, game._id);
      return { gameId: game._id, playerId: existing._id };
    }

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      name: args.playerName.trim(),
      isHost: false,
      score: 0,
      connected: true,
    });

    await touchGame(ctx, game._id);
    return { gameId: game._id, playerId };
  },
});

export const getPlayers = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

export const setPlayerConnected = mutation({
  args: { playerId: v.id("players"), connected: v.boolean() },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return;
    await ctx.db.patch(args.playerId, { connected: args.connected });
    await touchGame(ctx, player.gameId);
  },
});
