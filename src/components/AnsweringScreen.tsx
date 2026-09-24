import { useEffect, useState } from "react";
import { submitBluff } from "../lib/engine";
import type {
  AnswerRecord,
  GameRecord,
  PersonalQuestionRecord,
  PlayerRecord,
  RoundRecord,
} from "../lib/types";

interface AnsweringScreenProps {
  game: GameRecord;
  round: RoundRecord;
  question: PersonalQuestionRecord;
  players: PlayerRecord[];
  answers: AnswerRecord[];
  myPlayerId: string;
}

export default function AnsweringScreen({
  game,
  round,
  question,
  players,
  answers,
  myPlayerId,
}: AnsweringScreenProps) {
  const [answer, setAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);

  const me = players.find((p) => p.id === myPlayerId);
  const targetPlayer = players.find((p) => p.id === round.targetPlayer);
  const isTarget = myPlayerId === round.targetPlayer;
  const submitted =
    !!me?.bluffedRound && me.bluffedRound === round.id &&
    answers.some((a) => a.round === round.id && a.player === myPlayerId);

  useEffect(() => {
    if (submitted || isTarget) return;
    if (timeLeft <= 0) {
      if (answer.trim()) {
        handleSubmit();
      }
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted, answer, isTarget]);

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    try {
      await submitBluff(round, trimmed);
    } catch (err: any) {
      const msg: string = err?.response?.message || err?.message || String(err || "");
      if (err?.response?.data?.text || msg.includes("unique")) {
        setErrorMsg("already");
      } else if (msg.includes("SAME_AS_REAL")) {
        setErrorMsg("same");
      } else {
        setErrorMsg("حدث خطأ، حاول مرة أخرى.");
      }
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
          الجولة {round.roundNumber}
        </span>
        <span
          className={`text-sm font-bold px-3 py-1 rounded-full ${
            timeLeft <= 5 ? "bg-red-500" : "bg-white/20"
          }`}
        >
          {timeLeft}ث
        </span>
      </div>

      <h2 className="text-xl font-extrabold mb-2">
        {isTarget ? "أنت موضوع هذه الجولة" : "اكتب إجابة مقنعة"}
      </h2>
      <p className="text-white/70 mb-6">
        {isTarget
          ? "لا تكتب أي إجابة — انتظر حتى يكتب الباقون إجاباتهم الوهمية عنك."
          : `حاول خداع الجميع بإجابة وهمية عن سؤال ${targetPlayer?.name}`}
      </p>

      <div className="bg-white/10 border-2 border-yellow-400/50 rounded-2xl p-6 mb-6">
        <p className="text-lg font-bold">
          {question.questionText.replace("؟", ` ${targetPlayer?.name}؟`)}
        </p>
      </div>

      {isTarget ? (
        <div className="bg-white/10 rounded-2xl p-6">
          <div className="inline-block w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-white/60">انتظار إجابات اللاعبين...</p>
        </div>
      ) : submitted ? (
        <div className="bg-green-500/20 border border-green-400/40 rounded-2xl p-6">
          <p className="text-lg font-bold text-green-300">تم إرسال إجابتك!</p>
          <p className="text-white/70 text-sm mt-2">انتظر بقية اللاعبين...</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {errorMsg && errorMsg !== "already" && (
            <div className="bg-red-500/20 border border-red-400/50 rounded-xl p-3 text-red-200 text-sm font-bold">
              {errorMsg === "same"
                ? "لا يمكنك استخدام نفس إجابة صاحب السؤال! اكتب إجابة مختلفة."
                : errorMsg}
            </div>
          )}
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="اكتب إجابة وهمية"
            className="w-full px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 text-right"
            maxLength={100}
            autoFocus
          />
          <button
            type="submit"
            disabled={!answer.trim()}
            className="w-full py-3 px-6 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition disabled:opacity-60"
          >
            إرسال الإجابة
          </button>
        </form>
      )}
    </div>
  );
}
