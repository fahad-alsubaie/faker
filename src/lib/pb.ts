import PocketBase from "pocketbase";

const url = import.meta.env.PUBLIC_POCKETBASE_URL;

if (!url) {
  throw new Error("PUBLIC_POCKETBASE_URL is not set");
}

export const pb = new PocketBase(url);
pb.autoCancellation(false);

export function randomToken(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function signUpPlayer(opts: { name: string; isHost: boolean; game?: string }) {
  pb.authStore.clear();
  const username = "p" + randomToken(14);
  const password = randomToken(20);
  const record = await pb.collection("players").create({
    name: opts.name,
    username,
    password,
    passwordConfirm: password,
    isHost: opts.isHost,
    connected: true,
    game: opts.game ?? "",
  });
  await pb.collection("players").authWithPassword(username, password);
  return { record, username, password };
}

export async function reauth(username: string, password: string): Promise<boolean> {
  if (pb.authStore.isValid && pb.authStore.record?.collectionName === "players") return true;
  pb.authStore.clear();
  try {
    await pb.collection("players").authWithPassword(username, password);
    return true;
  } catch {
    return false;
  }
}
