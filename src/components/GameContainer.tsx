import { useEffect, useMemo, useRef } from "react";
import { usePbList, usePbRecord, useAuthGate } from "../hooks/usePb";
import { pb } from "../lib/pb";
import { getStoredPlayer } from "../lib/storage";
import {
  computeScores,
  maybeToResults,
  maybeToVoting,
  startRound,
} from "../lib/engine";
import type {
  AnswerRecord,
  GameRecord,
  PersonalQuestionRecord,
  PlayerRecord,
  RoundRecord,
  VoteRecord,
} from "../lib/types";
import SetupScreen from "./SetupScreen";
import AnsweringScreen from "./AnsweringScreen";
import VotingScreen from "./VotingScreen";
import ResultsScreen from "./ResultsScreen";
import FinishedScreen from "./FinishedScreen";
import Scoreboard from "./Scoreboard";

interface GameContainerProps {
  gameId: string;
}

export default function GameContainer({ gameId }: GameContainerProps) {
  const stored = getStoredPlayer();
  const { ready, authed } = useAuthGate();
  const myId = stored?.playerId ?? "";

  const { record: game, loading: gameLoading } = usePbRecord<GameRecord>(
    "games",
    ready ? gameId : undefined,
  );

  const { items: players } = usePbList<PlayerRecord>(
    "players",
    ready && game ? `game = "${game.id}"` : undefined,
  );
  const { items: questions } = usePbList<PersonalQuestionRecord>(
    "personalQuestions",
    ready && game ? `game = "${game.id}"` : undefined,
  );
  const { items: rounds } = usePbList<RoundRecord>(
    "rounds",
    ready && game ? `game = "${game.id}"` : undefined,
    "roundNumber",
  );
  const phaseKey = `${game?.status ?? ""}|${rounds.map((r) => r.status).join(",")}`;
  const { items: answers } = usePbList<AnswerRecord>(
    "answers",
    ready && game
      ? `round.game = "${game.id}" && (round.status != "answering" || player = "${myId}")`
      : undefined,
    "created,id",
    phaseKey,
  );
  const { items: votes } = usePbList<VoteRecord>(
    "votes",
    ready && game
      ? `round.game = "${game.id}" && (round.status = "results" || voter = "${myId}")`
      : undefined,
    "created,id",
    phaseKey,
  );

  const me = players.find((p) => p.id === myId);
  const isHost = !!me?.isHost;

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

  const watchdog = useRef(false);
  useEffect(() => {
    if (!game || !isHost) return;

    if (game.status === "setup" && questions.length > 0) {
      const allAnswered = questions.every((q) => !!q.answeredAt);
      if (allAnswered && !watchdog.current) {
        watchdog.current = true;
        startRound(game.id)
          .catch(() => {})
          .finally(() => {
            watchdog.current = false;
          });
      }
      return;
    }

    if (game.status === "answering") {
      const roundNumber = game.currentRoundIndex + 1;
      const round = rounds.find((r) => r.roundNumber === roundNumber);
      if (!round) {
        if (!watchdog.current) {
          watchdog.current = true;
          startRound(game.id)
            .catch(() => {})
            .finally(() => {
              watchdog.current = false;
            });
        }
        return;
      }
      if (round.status === "answering" && players.length >= 2) {
        const bluffed = players.filter(
          (p) => p.bluffedRound === round.id && p.id !== round.targetPlayer,
        );
        if (bluffed.length >= players.length - 1 && !watchdog.current) {
          watchdog.current = true;
          maybeToVoting(round.id)
            .catch(() => {})
            .finally(() => {
              watchdog.current = false;
            });
        }
      }
      return;
    }

    if (game.status === "voting" && players.length >= 2) {
      const roundNumber = game.currentRoundIndex + 1;
      const round = rounds.find((r) => r.roundNumber === roundNumber);
      if (round && round.status === "voting") {
        const voted = players.filter(
          (p) => p.votedRound === round.id && p.id !== round.targetPlayer,
        );
        if (voted.length >= players.length - 1 && !watchdog.current) {
          watchdog.current = true;
          maybeToResults(round.id)
            .catch(() => {})
            .finally(() => {
              watchdog.current = false;
            });
        }
      }
    }
  }, [game, isHost, questions, rounds, players]);

  const scores = useMemo(
    () => computeScores(players, rounds, answers, votes),
    [players, rounds, answers, votes],
  );

  if (!gameId) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">معرف اللعبة مفقود من الرابط</p>
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
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  if (!ready || gameLoading) {
    return (
      <div className="text-center">
        <p className="text-white/70">جاري تحميل اللعبة...</p>
      </div>
    );
  }

  if (!authed || !me) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">انتهت جلستك في هذه اللعبة</p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center">
        <p className="text-white/70 mb-4">اللعبة غير موجودة</p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-yellow-400 text-indigo-950 font-bold"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  if (game.status === "lobby") {
    window.location.href = `/lobby?code=${game.code}`;
    return null;
  }

  const sortedPlayers = [...players].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-4 relative">
      <Scoreboard players={sortedPlayers} scores={scores} myPlayerId={myId} />
      <div className="mt-4">
        <GameContent
          game={game}
          players={players}
          questions={questions}
          rounds={rounds}
          answers={answers}
          votes={votes}
          myPlayerId={myId}
          isHost={isHost}
        />
      </div>
    </div>
  );
}

function GameContent({
  game,
  players,
  questions,
  rounds,
  answers,
  votes,
  myPlayerId,
  isHost,
}: {
  game: GameRecord;
  players: PlayerRecord[];
  questions: PersonalQuestionRecord[];
  rounds: RoundRecord[];
  answers: AnswerRecord[];
  votes: VoteRecord[];
  myPlayerId: string;
  isHost: boolean;
}) {
  const roundNumber = game.currentRoundIndex + 1;
  const round = rounds.find((r) => r.roundNumber === roundNumber);
  const question = round
    ? questions.find((q) => q.id === round.personalQuestion)
    : undefined;

  if (game.status === "setup") {
    const mine = questions.filter((q) => q.player === myPlayerId);
    return <SetupScreen game={game} questions={mine} />;
  }

  if (game.status === "answering" && round) {
    return (
      <AnsweringScreen
        game={game}
        round={round}
        question={question!}
        players={players}
        answers={answers}
        myPlayerId={myPlayerId}
      />
    );
  }

  if (game.status === "voting" && round) {
    const roundAnswers = answers.filter((a) => a.round === round.id);
    return (
      <VotingScreen
        game={game}
        round={round}
        question={question!}
        players={players}
        answers={roundAnswers}
        votes={votes}
        myPlayerId={myPlayerId}
      />
    );
  }

  if (game.status === "results" && round) {
    const roundAnswers = answers.filter((a) => a.round === round.id);
    const roundVotes = votes.filter((v) => v.round === round.id);
    return (
      <ResultsScreen
        game={game}
        round={round}
        question={question!}
        players={players}
        answers={roundAnswers}
        votes={roundVotes}
        myPlayerId={myPlayerId}
        isHost={isHost}
      />
    );
  }

  if (game.status === "finished") {
    return (
      <FinishedScreen
        game={game}
        players={players}
        rounds={rounds}
        answers={answers}
        votes={votes}
        isHost={isHost}
      />
    );
  }

  return <p className="text-white/70">جاري التحميل...</p>;
}
