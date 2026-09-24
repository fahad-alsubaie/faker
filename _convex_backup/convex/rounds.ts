import { v } from "convex/values";
import { query, mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { shuffle } from "./questions";
import { touchGame } from "./games";

export const getAllPersonalQuestions = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("personalQuestions")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

export const submitPersonalAnswer = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("personalQuestions")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", args.gameId).eq("playerId", args.playerId),
      )
      .collect();

    const question = questions.find(
      (q) => q.realAnswer === undefined || q.realAnswer.trim() === "",
    );

    if (!question) throw new Error("No unanswered question assigned");

    await ctx.db.patch(question._id, { realAnswer: args.answer.trim() });
    await touchGame(ctx, args.gameId);
  },
});

export const getMySetupQuestions = query({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("personalQuestions")
      .withIndex("by_game_player", (q) =>
        q.eq("gameId", args.gameId).eq("playerId", args.playerId),
      )
      .collect();
  },
});

export const getCurrentRound = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const round = (
      await ctx.db
        .query("rounds")
        .withIndex("by_game_round", (q) =>
          q.eq("gameId", args.gameId).eq("roundNumber", game.currentRoundIndex + 1),
        )
        .collect()
    ).at(-1);

    if (!round) return null;

    const question = await ctx.db.get(round.personalQuestionId);
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return { round, question, players };
  },
});

export const submitFakeAnswer = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    roundId: v.id("rounds"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");
    if (round.gameId !== args.gameId) throw new Error("Wrong game");
    if (round.status !== "answering") throw new Error("Not answering phase");
    if (args.playerId === round.targetPlayerId) {
      throw new Error("Subject does not bluff in their own round");
    }
    if (round.fakeAnswers[args.playerId]) throw new Error("Already submitted");

    const question = await ctx.db.get(round.personalQuestionId);
    if (!question) throw new Error("Question not found");
    const text = args.text.trim();
    const real = (question.realAnswer || "").trim();
    if (real && text.toLowerCase() === real.toLowerCase()) {
      throw new Error("SAME_AS_REAL_ANSWER");
    }

    const updated = { ...round.fakeAnswers, [args.playerId]: text };
    await ctx.db.patch(args.roundId, { fakeAnswers: updated });
    await touchGame(ctx, args.gameId);

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const requiredSubmissions = players.length - 1;
    if (Object.keys(updated).length >= requiredSubmissions) {
      await prepareForVoting(ctx, args.gameId, args.roundId);
    }
  },
});

async function prepareForVoting(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundId: Id<"rounds">,
) {
  const round = await ctx.db.get(roundId);
  if (!round) throw new Error("Round not found");
  const question = await ctx.db.get(round.personalQuestionId);
  if (!question) throw new Error("Question not found");

  const allAnswers: {
    id: string;
    text: string;
    authorId: Id<"players"> | undefined;
    isReal: boolean;
  }[] = [];

  allAnswers.push({
    id: `real-${round.targetPlayerId}`,
    text: question.realAnswer!,
    authorId: undefined,
    isReal: true,
  });

  for (const [playerId, text] of Object.entries(round.fakeAnswers)) {
    allAnswers.push({
      id: `fake-${playerId}`,
      text: text as string,
      authorId: playerId as Id<"players">,
      isReal: false,
    });
  }

  const shuffled = shuffle(allAnswers);

  await ctx.db.patch(roundId, {
    status: "voting",
    allAnswersShuffled: shuffled,
  });

  await ctx.db.patch(gameId, { status: "voting" });
}

export const submitVote = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
    roundId: v.id("rounds"),
    answerId: v.string(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");
    if (round.gameId !== args.gameId) throw new Error("Wrong game");
    if (round.status !== "voting") throw new Error("Not voting phase");
    if (args.playerId === round.targetPlayerId) {
      throw new Error("Subject does not vote in their own round");
    }

    const answer = round.allAnswersShuffled.find((a) => a.id === args.answerId);
    if (!answer) throw new Error("Invalid answer");

    const ownFakeId = `fake-${args.playerId}`;
    if (args.answerId === ownFakeId) throw new Error("Cannot vote for own fake");

    const updatedVotes = { ...round.votes, [args.playerId]: args.answerId };
    await ctx.db.patch(args.roundId, { votes: updatedVotes });
    await touchGame(ctx, args.gameId);

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const requiredVotes = players.length - 1;
    if (Object.keys(updatedVotes).length >= requiredVotes) {
      await calculateRoundResults(ctx, args.gameId, args.roundId);
    }
  },
});

export const forceResolveRound = mutation({
  args: {
    gameId: v.id("games"),
    roundId: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    await calculateRoundResults(ctx, args.gameId, args.roundId);
  },
});

async function calculateRoundResults(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundId: Id<"rounds">,
) {
  const round = await ctx.db.get(roundId);
  if (!round) throw new Error("Round not found");
  if (round.status === "results") return;

  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();

  const playerMap = new Map<Id<"players">, Doc<"players">>(
    players.map((p) => [p._id, p]),
  );

  const fakeOwners = new Map<string, Id<"players">[]>();
  for (const [voterId, answerId] of Object.entries(round.votes)) {
    const owners = fakeOwners.get(answerId) || [];
    owners.push(voterId as Id<"players">);
    fakeOwners.set(answerId, owners);
  }

  const realAnswerId = `real-${round.targetPlayerId}`;

  const scoreDelta = new Map<Id<"players">, number>();

  for (const [answerId, voters] of fakeOwners.entries()) {
    if (answerId === realAnswerId) {
      for (const voterId of voters) {
        scoreDelta.set(voterId, (scoreDelta.get(voterId) || 0) + 100);
      }
    } else {
      const authorId = answerId.replace("fake-", "") as Id<"players">;
      const trickPoints = voters.length * 100;
      scoreDelta.set(authorId, (scoreDelta.get(authorId) || 0) + trickPoints);
    }
  }

  for (const [playerId, delta] of scoreDelta.entries()) {
    const player = playerMap.get(playerId);
    if (player) {
      await ctx.db.patch(playerId, { score: player.score + delta });
    }
  }

  await ctx.db.patch(roundId, { status: "results" });
  await ctx.db.patch(gameId, { status: "results", lastActivityAt: Date.now() });
}

export const getRoundResults = query({
  args: {
    gameId: v.id("games"),
    roundId: v.id("rounds"),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round || round.gameId !== args.gameId) return null;

    const question = await ctx.db.get(round.personalQuestionId);
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    const playerMap = new Map<Id<"players">, Doc<"players">>(
      players.map((p) => [p._id, p]),
    );

    const answers = round.allAnswersShuffled.map((answer) => {
      const voters = Object.entries(round.votes)
        .filter(([, answerId]) => answerId === answer.id)
        .map(([playerId]) => playerMap.get(playerId as Id<"players">))
        .filter((p): p is Doc<"players"> => !!p);

      return {
        ...answer,
        author: answer.authorId ? playerMap.get(answer.authorId) || null : null,
        voters,
      };
    });

    return {
      round,
      question,
      players,
      answers,
    };
  },
});
