import { useEffect, useState } from "react";
import { usePbList, useAuthGate } from "../hooks/usePb";
import { pb } from "../lib/pb";
import { getStoredPlayer } from "../lib/storage";
import type { GameRecord, PlayerRecord } from "../lib/types";
import LobbyScreen from "./LobbyScreen";

interface LobbyContainerProps {
  code: string;
}

export default function LobbyContainer({ code }: LobbyContainerProps) {
  const stored = getStoredPlayer();
  const { ready } = useAuthGate();

  const { items: games, loading } = usePbList<GameRecord>(
    "games",
    ready && code ? `code = "${code}"` : undefined,
  );
  const game = games[0] ?? null;
  const { items: players } = usePbList<PlayerRecord>(
    "players",
    ready && game ? `game = "${game.id}"` : undefined,
  );

  useEffect(() => {
    if (!stored?.playerId || !pb.authStore.isValid) return;
    const beat = () =>
      pb.collection("players").update(stored.playerId, { connected: true }).catch(() => {});
    beat();
    const heartbeat = setInterval(beat, 60000);
    const handleBeforeUnload = () => {
      fetch(pb.buildURL(`/api/collections/players/records/${stored.playerId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: pb.authStore.token,
        },
        body: JSON.stringify({ connected: false }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [stored?.playerId]);

  useEffect(() => {
    if (game && game.status !== "lobby") {
      window.location.href = `/game?gameId=${game.id}`;
    }
  }, [game]);

  if (!code) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">كود اللعبة مفقود من الرابط</p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  if (!stored) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">لم يتم العثور على بيانات اللاعب</p>
        <a
          href={`/?code=${code}`}
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          الانضمام للعبة
        </a>
      </div>
    );
  }

  if (!ready || loading) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">جاري تحميل اللعبة...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-2">اللعبة غير موجودة</p>
        <p className="text-white/50 text-sm mb-4">الكود: {code}</p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  return (
    <LobbyScreen
      code={code}
      game={game}
      players={players}
      myPlayerId={stored.playerId}
    />
  );
}
