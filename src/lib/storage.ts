const PLAYER_KEY = "faker_player";

export interface StoredPlayer {
  gameId: string;
  playerId: string;
  code: string;
  name: string;
  isHost: boolean;
  username: string;
  password: string;
}

export function storePlayer(player: StoredPlayer) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export function getStoredPlayer(): StoredPlayer | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PLAYER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredPlayer;
  } catch {
    return null;
  }
}

export function clearStoredPlayer() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PLAYER_KEY);
}
