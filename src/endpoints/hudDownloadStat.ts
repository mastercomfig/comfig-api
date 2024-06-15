import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import anonymize from "ip-anonymize";
import { HudCount, HudStat } from "../types";

export class HudDownloadStat extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["HUDs"],
    summary: "Record a HUD download stat",
    requestBody: HudStat,
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
    // Retrieve the validated request body
    const stat = data.body;

    const rawIp =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Real-Ip") ||
      (env.DEV && "127.0.0.1");
    if (rawIp === null) {
      return {
        success: false,
      };
    }
    const ip = anonymize(rawIp);

    const id = env.HUD_COUNT.idFromName(stat.id);

    try {
      const stub = env.HUD_COUNT.get(id);
      const success = await stub.increment(ip);
      return {
        success,
      };
    } catch (error) {
      console.error(error);
      return {
        success: false,
      };
    }
  }
}

export class HudDownloadGet extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["HUDs"],
    summary: "Get a HUD download stat",
    requestBody: HudCount,
    responses: {
      "200": {
        description: "Returns download count",
        schema: {
          count: Number,
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
    // Retrieve the validated request body
    const stat = data.body;

    if (stat.key !== env.API_TOKEN) {
      return {
        count: -2,
      };
    }

    const id = env.HUD_COUNT.idFromName(stat.id);

    try {
      const stub = env.HUD_COUNT.get(id);
      const count = await stub.getCounterValue();
      return {
        count,
      };
    } catch (error) {
      return {
        count: -1,
      };
    }
  }
}
