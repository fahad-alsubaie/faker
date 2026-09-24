export type GameStatus = "lobby" | "setup" | "answering" | "voting" | "results" | "finished";
export type RoundStatus = "answering" | "voting" | "results";

export interface GameRecord {
  id: string;
  created: string;
  updated: string;
  code: string;
  status: GameStatus;
  currentRoundIndex: number;
  maxRounds: number;
  lastActivityAt: string;
  collectionId: string;
  collectionName: "games";
}

export interface PlayerRecord {
  id: string;
  created: string;
  updated: string;
  name: string;
  username: string;
  game: string;
  isHost: boolean;
  connected: boolean;
  collectionId: string;
  collectionName: "players";
}

export interface PersonalQuestionRecord {
  id: string;
  created: string;
  updated: string;
  game: string;
  player: string;
  questionText: string;
  usedInRound: boolean;
  answeredAt: string;
  collectionId: string;
  collectionName: "personalQuestions";
}

export interface PersonalAnswerRecord {
  id: string;
  created: string;
  updated: string;
  question: string;
  player: string;
  text: string;
  collectionId: string;
  collectionName: "personalAnswers";
}

export interface RoundRecord {
  id: string;
  created: string;
  updated: string;
  game: string;
  roundNumber: number;
  targetPlayer: string;
  personalQuestion: string;
  status: RoundStatus;
  collectionId: string;
  collectionName: "rounds";
}

export interface AnswerRecord {
  id: string;
  created: string;
  updated: string;
  round: string;
  player: string;
  text: string;
  isReal: boolean;
  collectionId: string;
  collectionName: "answers";
}

export interface VoteRecord {
  id: string;
  created: string;
  updated: string;
  round: string;
  voter: string;
  answer: string;
  collectionId: string;
  collectionName: "votes";
}
