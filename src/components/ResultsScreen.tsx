import { useEffect, useState } from "react";
import { advanceRound, sortAnswers } from "../lib/engine";
import type {
  AnswerRecord,
  GameRecord,
  PersonalQuestionRecord,
  PlayerRecord,
  RoundRecord,
  VoteRecord,
} from "../lib/types";

interface ResultsScreenProps {
  game: GameRecord;
  round: RoundRecord;
  question: PersonalQuestionRecord;
  players: PlayerRecord[];
  answers: AnswerRecord[];
  votes: VoteRecord[];
  myPlayerId: string;
  isHost: boolean;
}

export default function ResultsScreen({
  game,
  round,
  question,
  players,
  answers,
  votes,
  myPlayerId,
  isHost,
}: ResultsScreenProps) {
  const [timeLeft, setTimeLeft] = useState(10);
  const [advancing, setAdvancing] = useState(false);

  const targetPlayer = players.find((p) => p.id === round.targetPlayer);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const roundAnswers = sortAnswers(answers.filter((a) => a.round === round.id));
  const realAnswer = roundAnswers.find((a) => a.isReal);

  useEffect(() => {
    if (!isHost || advancing) return;
    if (timeLeft <= 0) {
      advance();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isHost, advancing]);

  const advance = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await advanceRound(game);
    } catch (err) {
      setAdvancing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto text-center animate-fade-in">
      <h2 className="text-2xl font-extrabold mb-2">نتائج الجولة</h2>
      <p className="text-white/70 mb-6">
        الإجابة الحقيقية لـ {targetPlayer?.name}:
      </p>

      <div className="bg-green-500/20 border-2 border-green-400 rounded-2xl p-6 mb-8">
        <p className="text-xl font-bold text-green-300 mb-2">
          {question.questionText.replace("؟", ` ${targetPlayer?.name}؟`)}
        </p>
        <p className="text-2xl font-extrabold">{realAnswer?.text}</p>
      </div>

      <div className="grid gap-4 mb-8">
        {roundAnswers
          .filter((a) => !a.isReal)
          .map((answer) => {
            const author = playerById.get(answer.player);
            const voters = votes
              .filter((v) => v.answer === answer.id)
              .map((v) => playerById.get(v.voter))
              .filter((p): p is PlayerRecord => !!p);
            return (
              <div
                key={answer.id}
                className="bg-white/10 border border-white/20 rounded-xl p-4 text-right"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-lg">{answer.text}</span>
                  <span className="text-sm text-white/70">
                    كتبها: {author?.name || "غير معروف"}
                  </span>
                </div>
                {voters.length > 0 && (
                  <p className="text-sm text-white/60">
                    صوت لها: {voters.map((v) => v.name).join("، ")}
                  </p>
                )}
                {voters.length === 0 && (
                  <p className="text-sm text-white/40">لم يصوت أحد</p>
                )}
              </div>
            );
          })}
      </div>

      {isHost && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={advance}
            disabled={advancing}
            className="py-3 px-8 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition disabled:opacity-60"
          >
            {advancing ? "جاري التحميل..." : "الجولة التالية"}
          </button>
          <p className="text-white/50 text-sm">أو الانتقال التلقائي خلال {timeLeft} ثانية</p>
        </div>
      )}
      {!isHost && (
        <p className="text-white/60">انتظر المضيف للجولة التالية...</p>
      )}
    </div>
  );
}
