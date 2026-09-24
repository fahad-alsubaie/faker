import { useState } from "react";
import { startGame } from "../lib/engine";
import type { GameRecord, PlayerRecord } from "../lib/types";

interface LobbyScreenProps {
  code: string;
  game: GameRecord;
  players: PlayerRecord[];
  myPlayerId: string;
}

export default function LobbyScreen({
  code,
  game,
  players,
  myPlayerId,
}: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");

  const me = players.find((p) => p.id === myPlayerId);
  const isHost = !!me?.isHost;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}/?code=${code}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "فاكر",
          text: `انضم إلينا في لعبة فاكر! كود اللعبة: ${code}`,
          url,
        });
        return;
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleStart = async () => {
    setError("");
    if (players.length < 2) {
      setError("تحتاج لاعبين على الأقل للبدء");
      return;
    }
    try {
      await startGame(game.id);
      window.location.href = `/game?gameId=${game.id}`;
    } catch (err: any) {
      setError(err?.message || "حدث خطأ");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <h1 className="text-3xl font-extrabold mb-2">اللوبي</h1>
      <p className="text-white/70 mb-6">انضم اللاعبون باستخدام الكود التالي</p>

      <div className="bg-white/10 border-2 border-white/20 rounded-2xl p-6 mb-6">
        <p className="text-sm text-white/70 mb-1">كود اللعبة</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-mono font-bold tracking-widest">{code}</span>
          <button
            onClick={copyCode}
            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-semibold transition"
          >
            {copied ? "تم النسخ!" : "نسخ"}
          </button>
        </div>
        <button
          onClick={shareLink}
          className="mt-4 w-full py-2.5 rounded-xl bg-white/20 hover:bg-white/30 font-bold transition"
        >
          {linkCopied ? "تم نسخ رابط الدعوة!" : "مشاركة رابط الدعوة"}
        </button>
      </div>

      <div className="bg-white/10 border border-white/10 rounded-2xl p-4 mb-6">
        <h2 className="text-lg font-bold mb-3">اللاعبون ({players.length}/12)</h2>
        <ul className="space-y-2">
          {players.map((player) => (
            <li
              key={player.id}
              className={`flex items-center justify-between px-4 py-2 rounded-xl bg-white/5 ${
                player.id === myPlayerId ? "ring-2 ring-yellow-400" : ""
              }`}
            >
              <span className="font-semibold">
                {player.name}
                {player.id === myPlayerId && (
                  <span className="text-xs text-white/60 mr-2">(أنت)</span>
                )}
              </span>
              {player.isHost && (
                <span className="text-xs bg-yellow-400 text-indigo-950 px-2 py-0.5 rounded-full font-bold">
                  مضيف
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-red-300 text-sm mb-4">{error}</p>}

      {isHost ? (
        <button
          onClick={handleStart}
          disabled={players.length < 2}
          className="w-full py-3 px-6 rounded-xl bg-yellow-400 text-indigo-950 font-bold text-lg hover:bg-yellow-300 transition disabled:opacity-60"
        >
          ابدأ اللعبة
        </button>
      ) : (
        <p className="text-white/70">انتظر حتى يبدأ المضيف اللعبة...</p>
      )}
    </div>
  );
}
