import { useState } from "react";
import { createGame } from "../lib/engine";
import { storePlayer } from "../lib/storage";

export default function CreateGameForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("يرجى إدخال اسمك");
      return;
    }
    setLoading(true);
    try {
      const result = await createGame(trimmed);
      storePlayer({
        gameId: result.gameId,
        playerId: result.playerId,
        code: result.code,
        name: trimmed,
        isHost: true,
        username: result.username,
        password: result.password,
      });
      window.location.href = `/lobby?code=${result.code}`;
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء إنشاء اللعبة");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div>
        <label htmlFor="hostName" className="block text-sm font-semibold mb-1">
          اسمك
        </label>
        <input
          id="hostName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="أدخل اسمك"
          className="w-full px-4 py-3 rounded-xl border-2 border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 text-right"
          maxLength={20}
        />
      </div>
      {error && (
        <p className="text-red-300 text-sm text-center">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-6 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition disabled:opacity-60"
      >
        {loading ? "جاري الإنشاء..." : "إنشاء لعبة"}
      </button>
    </form>
  );
}
