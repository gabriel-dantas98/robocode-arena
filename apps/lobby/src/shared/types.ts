export type Player = {
  id: string;
  nick: string;
  color: string;
  /** Visual chassis only — does not affect Robocode physics. */
  chassis: string;
  ready: boolean;
  botPath: string | null;
  botName: string | null;
  lang: string | null;
  updatedAt: number;
};

export type RoomStatus = "lobby" | "starting" | "running" | "ended" | "failed";

export type Room = {
  code: string;
  ownerToken: string;
  createdAt: number;
  status: RoomStatus;
  players: Map<string, Player>;
  battleId: string | null;
  results: unknown[] | null;
  error: string | null;
};

export type PublicPlayer = Omit<Player, never>;

export type PublicRoom = {
  code: string;
  status: RoomStatus;
  players: PublicPlayer[];
  battleId: string | null;
  results: unknown[] | null;
  error: string | null;
  canPlay: boolean;
  publicUrl: string | null;
};
