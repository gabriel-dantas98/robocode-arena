import { customAlphabet } from "nanoid";
import type { Player, PublicRoom, Room, RoomStatus } from "../shared/types";

const codeGen = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const idGen = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

export class RoomStore {
  private rooms = new Map<string, Room>();
  private listeners = new Map<string, Set<(room: PublicRoom) => void>>();

  constructor(private publicUrl: () => string | null) {}

  create(): { room: PublicRoom; ownerToken: string } {
    const code = codeGen();
    const ownerToken = idGen() + idGen();
    const room: Room = {
      code,
      ownerToken,
      createdAt: Date.now(),
      status: "lobby",
      players: new Map(),
      battleId: null,
      results: null,
      error: null,
    };
    this.rooms.set(code, room);
    return { room: this.toPublic(room), ownerToken };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  isOwner(code: string, token: string | null | undefined): boolean {
    const room = this.get(code);
    return !!room && !!token && room.ownerToken === token;
  }

  join(
    code: string,
    input: { nick: string; color: string },
  ): { player: Player; room: PublicRoom } {
    const room = this.require(code);
    if (room.status !== "lobby") throw new Error("Room is not accepting joins");
    const nick = input.nick.trim().slice(0, 24) || "Anon";
    const color = /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : randomColor();
    const player: Player = {
      id: idGen(),
      nick,
      color,
      ready: false,
      botPath: null,
      botName: null,
      lang: null,
      updatedAt: Date.now(),
    };
    room.players.set(player.id, player);
    this.emit(room);
    return { player, room: this.toPublic(room) };
  }

  updatePlayer(
    code: string,
    playerId: string,
    patch: Partial<Pick<Player, "nick" | "color" | "ready" | "botPath" | "botName" | "lang">>,
  ): PublicRoom {
    const room = this.require(code);
    const player = room.players.get(playerId);
    if (!player) throw new Error("Player not found");
    if (room.status !== "lobby" && patch.ready === undefined) {
      throw new Error("Cannot edit during battle");
    }
    if (patch.nick !== undefined) player.nick = patch.nick.trim().slice(0, 24) || player.nick;
    if (patch.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.color)) player.color = patch.color;
    if (patch.botPath !== undefined) {
      player.botPath = patch.botPath;
      player.ready = false;
    }
    if (patch.botName !== undefined) player.botName = patch.botName;
    if (patch.lang !== undefined) player.lang = patch.lang;
    if (patch.ready !== undefined) {
      if (patch.ready && !player.botPath) throw new Error("Upload a bot before ready");
      player.ready = patch.ready;
    }
    player.updatedAt = Date.now();
    this.emit(room);
    return this.toPublic(room);
  }

  setStatus(code: string, status: RoomStatus, extra?: Partial<Pick<Room, "battleId" | "results" | "error">>) {
    const room = this.require(code);
    room.status = status;
    if (extra?.battleId !== undefined) room.battleId = extra.battleId;
    if (extra?.results !== undefined) room.results = extra.results;
    if (extra?.error !== undefined) room.error = extra.error;
    this.emit(room);
  }

  resetLobby(code: string) {
    const room = this.require(code);
    room.status = "lobby";
    room.battleId = null;
    room.results = null;
    room.error = null;
    for (const p of room.players.values()) p.ready = false;
    this.emit(room);
  }

  subscribe(code: string, fn: (room: PublicRoom) => void): () => void {
    const key = code.toUpperCase();
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(fn);
    const room = this.get(key);
    if (room) fn(this.toPublic(room));
    return () => this.listeners.get(key)?.delete(fn);
  }

  toPublic(room: Room): PublicRoom {
    const players = [...room.players.values()];
    const canPlay =
      room.status === "lobby" &&
      players.length >= 2 &&
      players.every((p) => p.ready && p.botPath);
    return {
      code: room.code,
      status: room.status,
      players,
      battleId: room.battleId,
      results: room.results,
      error: room.error,
      canPlay,
      publicUrl: this.publicUrl(),
    };
  }

  private require(code: string): Room {
    const room = this.get(code);
    if (!room) throw new Error("Room not found");
    return room;
  }

  private emit(room: Room) {
    const pub = this.toPublic(room);
    for (const fn of this.listeners.get(room.code) || []) fn(pub);
  }
}

function randomColor() {
  const palette = ["#E4572E", "#17BEBB", "#FFC914", "#2E86AB", "#A23B72", "#76B041", "#F18F01", "#C73E1D"];
  return palette[Math.floor(Math.random() * palette.length)];
}
