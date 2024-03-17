import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import { HudStat } from "../types";

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

    // return the new task
    return {
      success: true,
    };
  }
}
