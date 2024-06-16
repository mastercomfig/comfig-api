import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
} from "@cloudflare/itty-router-openapi";
import { SchemaData } from "../types";

export class SchemaGet extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Schema"],
    summary: "Get the latest schema.",
    responses: {
      "200": {
        description: "Returns schema",
        schema: {
          schema: {},
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
    const schema = await env.QUICKPLAY.get("schema");
    return new Response(schema);
  }
}

export class SchemaUpdate extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    tags: ["Schema"],
    summary: "Update the schema",
    requestBody: SchemaData,
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
    const schema = data.body.schema;

    await env.QUICKPLAY.put("schema", JSON.stringify(schema));

    return {
      success: true,
    };
  }
}
