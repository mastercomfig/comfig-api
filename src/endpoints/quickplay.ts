import iata from "@adaptivelink/iata";
import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import geodesic from "geographiclib-geodesic";
import { ServerListData, ServerListRequest } from "../types";

const geod = geodesic.Geodesic.WGS84;

// approximation for fixed cost of network communication
const CONSTANT_OVERHEAD = 2;

// approximation for how much distance light can travel through fiber in 1ms (and back).
const KM_PER_MS_FIBER = [125, 72, 65.5];
const KM_THRESHOLDS = [250, 1250, -1];

let cachedResponse = null;
let cachedResponseExpiration = 0;

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

const ONE_MINUTE = 60 * 1000;

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
          until: Number,
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
    const body = data.body;
    // theory: last mile network contributes to latency much more than full routing
    // for the small latencies we care about for good ping to a server.
    // and for huge routing errors (for example in Brazil), those are accounted for
    // most likely in our error approximation.
    // client to GC - estimates overhead of last mile for ~client
    const actualC2G = body.ping; // we get the timing from the client (minus 2)
    const lon = parseFloat(cfLon);
    const lat = parseFloat(cfLat);
    const country = request.cf.country;
    const continent = request.cf.continent;
    const myColo = request.cf.colo;
    const [myLat, myLon] = iata.airports.get(myColo);
    const distC2G = geod.Inverse(lat, lon, myLat, myLon).s12 / 1000;
    const expectedC2G = idealDistToPing(distC2G);
    const overheadC2G = Math.max(actualC2G - expectedC2G, 0); // maybe let this go negative?

    const now = new Date().getTime();
    if (cachedResponseExpiration <= now) {
      const { kvResp, metadata } = await env.QUICKPLAY.getWithMetadata(
        "servers",
        {
          type: "json",
        }
      );
      if (!kvResp) {
        cachedResponse = await env.QUICKPLAY.get("servers", {
          type: "json",
        });
      } else {
        cachedResponse = kvResp;
      }
      // When we get from KV, that's an enforced 60 second cache.
      // So, enforce that here.
      // We also check to see if the querier expects the data to be stale by 60 seconds from now.
      cachedResponseExpiration = Math.max(
        metadata?.until ?? 0,
        now + ONE_MINUTE
      );
    }
    const servers = structuredClone(cachedResponse);
    const until = cachedResponseExpiration;
    if (!servers) {
      return [];
    }

    for (const server of servers) {
      const [serverLon, serverLat] = server.point;
      delete server.point;
      const distC2S = geod.Inverse(lat, lon, serverLat, serverLon).s12 / 1000;
      // we're expecting this to be the ideal case, and we add estimated overhead
      const expectedC2S = idealDistToPing(distC2S);
      // server to querier - estimates overhead of last mile for ~server
      const overheadS2Q = Math.min(expectedC2S, server.ping / 2); // this is just the raw overhead (minus 2)
      const overallOverhead = Math.max(overheadC2G + overheadS2Q, 5);
      const overallPing = expectedC2S + overallOverhead + CONSTANT_OVERHEAD;
      server.ping = overallPing;
    }

    if (body.version === 2) {
      return { servers, until };
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
    const body = data.body;
    const servers = body.servers;
    const until = body.until;

    await env.QUICKPLAY.put("servers", JSON.stringify(servers), {
      metadata: { until },
    });

    // One server gets to cache early because its putting.
    cachedResponse = servers;
    // Refresh the expiration if our KV cache won't be stale at that time.
    if (until > cachedResponseExpiration) {
      cachedResponseExpiration = until;
    }

    return {
      success: true,
    };
  }
}
