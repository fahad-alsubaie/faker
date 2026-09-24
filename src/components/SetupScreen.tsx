import { useState } from "react";
import { submitPersonalAnswer } from "../lib/engine";
import type { GameRecord, PersonalQuestionRecord } from "../lib/types";

interface SetupScreenProps {
  game: GameRecord;
  questions: PersonalQuestionRecord[];
}

export default function SetupScreen({ game, questions }: SetupScreenProps) {
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const answered = questions.filter((q) => !!q.answeredAt);
  const current = questions.find((q) => !q.answeredAt);

  if (!current) {
    return (
      <div className="w-full max-w-md mx-auto text-center animate-fade-in">
        <h2 className="text-2xl font-extrabold mb-4">تم الرد على كل الأسئلة!</h2>
        <p className="text-white/80 mb-6">
          انتظر بقية اللاعبين حتى يجيبوا على أسئلتهم.
        </p>
        <div className="bg-white/10 rounded-2xl p-6">
          <div className="inline-block w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-white/60">جاري إعداد الجولات...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      await submitPersonalAnswer(trimmed);
      setAnswer("");
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <h2 className="text-2xl font-extrabold mb-2">إعداد اللاعب</h2>
      <p className="text-white/70 mb-4">اجب عن أسئلتك الشخصية بصراحة!</p>

      <div className="flex items-center justify-center gap-2 mb-6">
        {questions.map((q, i) => (
          <span
            key={q.id}
            className={`w-3 h-3 rounded-full ${
              answered.length > i ? "bg-green-400" : "bg-white/20"
            }`}
          />
        ))}
        <span className="text-sm text-white/60 mr-2">
          {answered.length} / {questions.length}
        </span>
      </div>

      <div className="bg-white/10 border-2 border-yellow-400/50 rounded-2xl p-6 mb-6">
        <p className="text-lg font-bold mb-4">{current.questionText}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="اكتب إجابتك الحقيقية"
          className="w-full px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 text-right"
          maxLength={100}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !answer.trim()}
          className="w-full py-3 px-6 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition disabled:opacity-60"
        >
          {loading ? "جاري الحفظ..." : "إرسال الإجابة"}
        </button>
      </form>
    </div>
  );
}
