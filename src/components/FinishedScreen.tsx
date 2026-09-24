import { computeScores, resetGame } from "../lib/engine";
import type {
  AnswerRecord,
  GameRecord,
  PlayerRecord,
  RoundRecord,
  VoteRecord,
} from "../lib/types";

interface FinishedScreenProps {
  game: GameRecord;
  players: PlayerRecord[];
  rounds: RoundRecord[];
  answers: AnswerRecord[];
  votes: VoteRecord[];
  isHost: boolean;
}

export default function FinishedScreen({
  game,
  players,
  rounds,
  answers,
  votes,
  isHost,
}: FinishedScreenProps) {
  const scores = computeScores(players, rounds, answers, votes);
  const sorted = [...players].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  const top3 = sorted.slice(0, 3);

  const playAgain = async () => {
    try {
      await resetGame(game.id);
      window.location.href = `/lobby?code=${game.code}`;
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <h2 className="text-3xl font-extrabold mb-2">انتهت اللعبة!</h2>
      <p className="text-white/70 mb-8">المنصة النهائية</p>

      <div className="flex items-end justify-center gap-3 mb-8">
        {top3[1] && (
          <div className="flex flex-col items-center">
            <div className="bg-white/20 rounded-t-2xl px-4 py-3 flex flex-col items-center">
              <span className="text-2xl font-bold">2</span>
              <span className="font-bold text-sm">{top3[1].name}</span>
              <span className="text-yellow-300 font-bold">{scores.get(top3[1].id) ?? 0}</span>
            </div>
            <div className="w-full h-16 bg-gray-300 rounded-b-xl" />
          </div>
        )}
        {top3[0] && (
          <div className="flex flex-col items-center -mt-4">
            <div className="bg-yellow-400 text-indigo-950 rounded-t-2xl px-5 py-4 flex flex-col items-center">
              <span className="text-3xl font-extrabold">1</span>
              <span className="font-extrabold text-sm">{top3[0].name}</span>
              <span className="font-extrabold">{scores.get(top3[0].id) ?? 0}</span>
            </div>
            <div className="w-full h-24 bg-yellow-500 rounded-b-xl" />
          </div>
        )}
        {top3[2] && (
          <div className="flex flex-col items-center">
            <div className="bg-white/20 rounded-t-2xl px-4 py-3 flex flex-col items-center">
              <span className="text-2xl font-bold">3</span>
              <span className="font-bold text-sm">{top3[2].name}</span>
              <span className="text-yellow-300 font-bold">{scores.get(top3[2].id) ?? 0}</span>
            </div>
            <div className="w-full h-12 bg-amber-700 rounded-b-xl" />
          </div>
        )}
      </div>

      <div className="bg-white/10 rounded-2xl p-4 mb-6">
        <h3 className="font-bold mb-3">الترتيب النهائي</h3>
        <ul className="space-y-2 text-right">
          {sorted.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between px-4 py-2 rounded-xl bg-white/5"
            >
              <span className="font-semibold">
                {index + 1}. {player.name}
              </span>
              <span className="font-bold text-yellow-300">{scores.get(player.id) ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          onClick={playAgain}
          className="w-full py-3 px-6 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition"
        >
          العب مرة أخرى
        </button>
      ) : (
        <p className="text-white/70">انتظر المضيف لبدء لعبة جديدة</p>
      )}
    </div>
  );
}
