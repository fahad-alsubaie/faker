import { useState } from "react";
import LobbyContainer from "./LobbyContainer";

function getParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export default function LobbyPage() {
  const [code] = useState(() => getParam("code"));

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-4">
      <LobbyContainer code={code} />
    </div>
  );
}
