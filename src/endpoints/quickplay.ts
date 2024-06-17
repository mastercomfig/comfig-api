import iata from "@adaptivelink/iata";
import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import geodesic from "geographiclib-geodesic";
import { ServerListData, ServerListRequest } from "../types";

const geod = geodesic.Geodesic.WGS84;

// overall approximation
function estDistToPing(km: number) {
  return (km / 1000) * 28;
}

// approximation for fixed cost of network communication
const CONSTANT_OVERHEAD = 2;

// approximation for how much distance light can travel through fiber in 1ms (and back).
const KM_PER_MS_FIBER = [200, 150, 125, 100, 28];
const KM_THRESHOLDS = [250, 1250, 1500, 2000, -1];

function takeNum(num: number, consume: number) {
  if (num <= consume) {
    return [0, num];
  }
  return [num - consume, consume];
}

function idealDistToPing(km: number) {
  let ping = 0;
  for (let i = 0; i < KM_THRESHOLDS.length; i++) {
    const consume = KM_THRESHOLDS[i];
    const cost = KM_PER_MS_FIBER[i];
    if (consume === -1) {
      ping += km / cost;
      break;
    }
    const [newKm, consumed] = takeNum(km, consume);
    ping += consumed / cost;
    if (newKm == 0) {
      break;
    }
    km = newKm;
  }
  return ping;
}

export class ServerListHello extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Quickplay"],
    summary: "Get latency to public server list.",
    responses: {
      "200": {
        description: "Says hello",
      },
    },
  };

  async handle(
    request: Request,
    env: any,
    context: any,
    data: Record<string, any>
  ) {
    return new Response();
  }
}

const Server = {
  addr: String,
  steamid: String,
  name: String,
  players: Number,
  max_players: Number,
  bots: Number,
  map: String,
  gametype: [String],
  score: Number,
  ping: Number,
};

export class ServerListQuery extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Quickplay"],
    summary: "Get the public server list for quickplay.",
    requestBody: ServerListRequest,
    responses: {
      "200": {
        description: "Returns servers",
        schema: {
          servers: [Server],
        },
      },
    },
  };

  async handle(
    request: Request,
    env: any,
    context: any,
    data: Record<string, any>
  ) {
    const cfLon = request.cf.longitude as string | undefined;
    const cfLat = request.cf.latitude as string | undefined;
    if (!cfLat || !cfLon) {
      return {};
    }
    // theory: last mile network contributes to latency much more than full routing
    // for the small latencies we care about for good ping to a server.
    // and for huge routing errors (for example in Brazil), those are accounted for
    // most likely in our error approximation.
    // client to GC - estimates overhead of last mile for ~client
    const actualC2G = data.body.ping; // we get the timing from the client (minus 2)
    const lon = parseFloat(cfLon);
    const lat = parseFloat(cfLat);
    const country = request.cf.country;
    const continent = request.cf.continent;
    const myColo = request.cf.colo;
    const [myLat, myLon] = iata.airports.get(myColo);
    const distC2G = geod.Inverse(lat, lon, myLat, myLon).s12 / 1000;
    const expectedC2G = idealDistToPing(distC2G);
    const overheadC2G = Math.max(actualC2G - expectedC2G, 0); // maybe let this go negative?

    const servers = await env.QUICKPLAY.get("servers", { type: "json" });
    if (!servers) {
      return [];
    }

    for (const server of servers) {
      const [serverLon, serverLat] = server.point;
      delete server.point;
      // server to querier - estimates overhead of last mile for ~server
      const overheadS2Q = server.ping / 2; // this is just the raw overhead (minus 2)
      const distC2S = geod.Inverse(lat, lon, serverLat, serverLon).s12 / 1000;
      // we're expecting this to be the ideal case, and we add estimated overhead
      const expectedC2S = idealDistToPing(distC2S);
      const overallOverhead = Math.max(overheadC2G + overheadS2Q, 5);
      const overallPing = expectedC2S + overallOverhead + CONSTANT_OVERHEAD;
      server.ping = overallPing;
    }

    return servers;
  }
}

export class ServerListUpdate extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Quickplay"],
    summary: "Update the server list",
    requestBody: ServerListData,
    responses: {
      "200": {
        description: "Returns success",
        schema: {
          success: Boolean,
        },
      },
    },
  };

  async handle(
    request: Request,
    env: any,
    context: any,
    data: Record<string, any>
  ) {
    if (request.headers.get("Authorization") !== `Bearer ${env.API_TOKEN}`) {
      return {
        success: false,
      };
    }

    // Retrieve the validated request body
    const servers = data.body.servers;

    await env.QUICKPLAY.put("servers", JSON.stringify(servers));

    return {
      success: true,
    };
  }
}
