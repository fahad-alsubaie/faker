import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "stale-game-janitor",
  { minutes: 5 },
  internal.games.deleteStaleGames,
  {},
);

export default crons;
