import { useState } from "react";
import CreateGameForm from "./CreateGameForm";
import JoinGameForm from "./JoinGameForm";

function getParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export default function HomePage() {
  const [inviteCode] = useState(() => getParam("code"));

  return (
    <div className="w-full max-w-md mx-auto text-center animate-fade-in">
      <h1 className="text-5xl font-extrabold mb-2 text-yellow-400">فاكر</h1>
      <p className="text-white/80 mb-8 text-lg">لعبة الحزب العربية — خدع أصدقاءك!</p>

      {inviteCode && (
        <div className="mb-6 bg-green-400/20 border border-green-400/40 rounded-xl p-3 text-sm font-bold text-green-300">
          تمت دعوتك للانضمام للعبة — أدخل اسمك فقط!
        </div>
      )}

      <div className="space-y-8">
        {inviteCode ? (
          <section className="bg-white/10 border-2 border-yellow-400/50 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">انضم بلعبة</h2>
            <JoinGameForm initialCode={inviteCode} />
            <div className="relative flex items-center justify-center mt-6">
              <div className="flex-grow h-px bg-white/20"></div>
              <span className="px-3 text-white/50 text-sm font-bold">أو</span>
              <div className="flex-grow h-px bg-white/20"></div>
            </div>
            <div className="mt-6">
              <h2 className="text-xl font-bold mb-4">ابدأ لعبة جديدة</h2>
              <CreateGameForm />
            </div>
          </section>
        ) : (
          <>
            <section className="bg-white/10 border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">ابدأ لعبة جديدة</h2>
              <CreateGameForm />
            </section>

            <div className="relative flex items-center justify-center">
              <div className="flex-grow h-px bg-white/20"></div>
              <span className="px-3 text-white/50 text-sm font-bold">أو</span>
              <div className="flex-grow h-px bg-white/20"></div>
            </div>

            <section className="bg-white/10 border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">انضم بلعبة</h2>
              <JoinGameForm />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
