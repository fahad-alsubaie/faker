import type { PlayerRecord } from "../lib/types";

interface ScoreboardProps {
  players: PlayerRecord[];
  scores: Map<string, number>;
  myPlayerId: string;
}

export default function Scoreboard({ players, scores, myPlayerId }: ScoreboardProps) {
  return (
    <div className="fixed top-4 left-4 z-50 hidden md:block">
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 w-56">
        <h3 className="font-bold text-center mb-3">النقاط</h3>
        <ul className="space-y-2">
          {players.map((player) => (
            <li
              key={player.id}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                player.id === myPlayerId ? "bg-yellow-400/20" : "bg-white/5"
              }`}
            >
              <span className="font-semibold truncate max-w-[7rem]">
                {player.name}
                {player.connected === false && (
                  <span className="text-red-400 mr-1">●</span>
                )}
              </span>
              <span className="font-bold text-yellow-300">{scores.get(player.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
