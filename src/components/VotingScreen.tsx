import { useEffect, useState } from "react";
import { sortAnswers, submitVote } from "../lib/engine";
import type {
  AnswerRecord,
  GameRecord,
  PersonalQuestionRecord,
  PlayerRecord,
  RoundRecord,
  VoteRecord,
} from "../lib/types";

interface VotingScreenProps {
  game: GameRecord;
  round: RoundRecord;
  question: PersonalQuestionRecord;
  players: PlayerRecord[];
  answers: AnswerRecord[];
  votes: VoteRecord[];
  myPlayerId: string;
}

export default function VotingScreen({
  game,
  round,
  question,
  players,
  answers,
  votes,
  myPlayerId,
}: VotingScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(20);

  const me = players.find((p) => p.id === myPlayerId);
  const targetPlayer = players.find((p) => p.id === round.targetPlayer);
  const isSubject = myPlayerId === round.targetPlayer;
  const myVote = votes.find((v) => v.voter === myPlayerId && v.round === round.id);
  const submitted = (me?.votedRound === round.id && !!myVote) || false;

  const filteredAnswers = sortAnswers(
    answers.filter((a) => a.round === round.id && a.player !== myPlayerId),
  );

  useEffect(() => {
    if (myVote) setSelected(myVote.answer);
  }, [myVote?.answer]);

  useEffect(() => {
    if (submitted || isSubject) return;
    if (timeLeft <= 0) {
      autoVote();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, submitted, isSubject, filteredAnswers.length]);

  const autoVote = async () => {
    if (submitted || isSubject) return;
    const pick = selected || filteredAnswers[0]?.id;
    if (!pick) return;
    try {
      await submitVote(round, pick);
      setSelected(pick);
    } catch (err) {
      // ignore
    }
  };

  const handleSelect = async (answerId: string) => {
    if (submitted || isSubject) return;
    setSelected(answerId);
    try {
      await submitVote(round, answerId);
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full">
          التصويت
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
        {isSubject ? "أنت موضوع هذه الجولة" : "اختر الإجابة الصحيحة"}
      </h2>
      <p className="text-white/70 mb-4">
        {isSubject
          ? "لا تصوت في جولتك — أنت تعرف الإجابة الصحيحة!"
          : `ما هي إجابة ${targetPlayer?.name} الحقيقية؟`}
      </p>

      <div className="bg-white/10 border-2 border-yellow-400/50 rounded-2xl p-4 mb-6">
        <p className="text-lg font-bold">
          {question.questionText.replace("؟", ` ${targetPlayer?.name}؟`)}
        </p>
      </div>

      {isSubject ? (
        <div className="bg-white/10 rounded-2xl p-6">
          <div className="inline-block w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-white/60">انتظار تصويت اللاعبين...</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAnswers.map((answer) => {
            const isSelected = selected === answer.id;
            return (
              <button
                key={answer.id}
                onClick={() => handleSelect(answer.id)}
                disabled={submitted}
                className={`w-full p-4 rounded-xl border-2 text-right transition ${
                  isSelected
                    ? "border-yellow-400 bg-yellow-400/20"
                    : "border-white/20 bg-white/10 hover:bg-white/20"
                } disabled:opacity-70`}
              >
                <span className="font-semibold text-lg">{answer.text}</span>
              </button>
            );
          })}
        </div>
      )}

      {submitted && !isSubject && (
        <p className="mt-4 text-white/70">تم التصويت! انتظر النتائج...</p>
      )}
    </div>
  );
}
