import { z } from "zod";

export const HudStat = {
  id: String,
};

export const HudCount = {
  id: String,
};

export const ServerListRequest = {
  ping: Number,
  version: Number,
};

export const ServerPrivate = {
  addr: String,
  steamid: String,
  name: String,
  players: Number,
  max_players: Number,
  bots: Number,
  map: String,
  gametype: [String],
  score: Number,
  point: [Number],
  ping: Number,
};

export const ServerListData = {
  servers: [ServerPrivate],
  until: Number,
};

export const SchemaData = {
  schema: z.any(),
};
