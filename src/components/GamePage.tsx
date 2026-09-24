import { useState } from "react";
import GameContainer from "./GameContainer";

function getParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export default function GamePage() {
  const [gameId] = useState(() => getParam("gameId"));

  return (
    <div className="w-full min-h-screen">
      <GameContainer gameId={gameId} />
    </div>
  );
}
