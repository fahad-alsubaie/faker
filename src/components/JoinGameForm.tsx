import { useState } from "react";
import { joinGame } from "../lib/engine";
import { storePlayer } from "../lib/storage";

interface JoinGameFormProps {
  initialCode?: string;
}

export default function JoinGameForm({ initialCode = "" }: JoinGameFormProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    if (!/^[0-9]{6}$/.test(trimmedCode)) {
      setError("كود اللعبة يجب أن يكون 6 أرقام");
      return;
    }
    if (!trimmedName) {
      setError("يرجى إدخال اسمك");
      return;
    }

    setLoading(true);
    try {
      const result = await joinGame(trimmedCode, trimmedName);
      storePlayer({
        gameId: result.gameId,
        playerId: result.playerId,
        code: trimmedCode,
        name: trimmedName,
        isHost: false,
        username: result.username,
        password: result.password,
      });
      window.location.href = `/lobby?code=${trimmedCode}`;
    } catch (err: any) {
      setError(err?.message || "كود اللعبة غير صحيح أو اللعبة بدأت");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div>
        <label htmlFor="gameCode" className="block text-sm font-semibold mb-1">
          كود اللعبة
        </label>
        <input
          id="gameCode"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="w-full px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 text-center tracking-[0.5em] font-mono text-2xl dir-ltr"
          maxLength={6}
        />
      </div>
      <div>
        <label htmlFor="playerName" className="block text-sm font-semibold mb-1">
          اسمك
        </label>
        <input
          id="playerName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="أدخل اسمك"
          className="w-full px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 text-right"
          maxLength={20}
          autoFocus={!!initialCode}
        />
      </div>
      {error && (
        <p className="text-red-300 text-sm text-center">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-6 rounded-xl bg-green-400 text-indigo-950 font-bold text-lg hover:bg-green-300 transition disabled:opacity-60"
      >
        {loading ? "جاري الانضمام..." : "انضم بلعبة"}
      </button>
    </form>
  );
}
