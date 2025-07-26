import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { DurableObject } from "cloudflare:workers";
import { HudDownloadGet, HudDownloadStat } from "endpoints/hudDownloadStat";
import {
  ServerListHello,
  ServerListQuery,
  ServerListUpdate,
} from "endpoints/quickplay";
import { SchemaGet, SchemaUpdate } from "endpoints/schema";
import { createCors } from "itty-router";

export interface Env {
  HUD_COUNT: DurableObjectNamespace<HudDownloadCounter>;
  QUICKPLAY: KVNamespace;
  DB: D1Database;
}

const { preflight, corsify } = createCors({
  origins: [
    "https://comfig.app",
    "https://staging.mastercomfig-site.pages.dev",
    "http://localhost:4321",
    "http://127.0.0.1:4321",
    "http://localhost:8787",
  ],
  methods: ["GET", "HEAD", "POST"],
  maxAge: 900,
  headers: {
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self' 'unsafe-inline' https://unpkg.com https://static.cloudflareinsights.com; style-src 'self' https://unpkg.com; connect-src 'self'; frame-ancestors 'none'",
  },
});

export const router = OpenAPIRouter({
  docs_url: "/",
});

router.all("*", preflight);
router.post("/api/huds/download/add", HudDownloadStat);
router.post("/api/huds/download/get", HudDownloadGet);
router.post("/api/quickplay/hello", ServerListHello);
router.post("/api/quickplay/list", ServerListQuery);
router.post("/api/quickplay/update", ServerListUpdate);
router.post("/api/schema/get", SchemaGet);
router.post("/api/schema/update", SchemaUpdate);

// 404 for everything else
router.all("*", () =>
  Response.json(
    {
      success: false,
      error: "Route not found",
    },
    { status: 404 }
  )
);

export class HudDownloadCounter extends DurableObject {
  static milliseconds_per_request = 86400000;

  async getCounterValue(): Promise<number> {
    let value = ((await this.ctx.storage.get("value")) as number) || 0;
    return value;
  }

  async getKnownIpBlocks() {
    let value = (await this.ctx.storage.get("known")) || {};
    return value;
  }

  async increment(ip: string) {
    const knownIpBlocks = await this.getKnownIpBlocks();
    const now = Date.now();
    const last = knownIpBlocks[ip];
    // TODO: add fractional download value over duration of cooldown?
    if (last && now - last < HudDownloadCounter.milliseconds_per_request) {
      return false;
    }
    knownIpBlocks[ip] = now;
    await this.ctx.storage.put("known", knownIpBlocks);
    // avoids call to getCounterValue()
    let value = ((await this.ctx.storage.get("value")) as number) || 0;
    value += 1;
    await this.ctx.storage.put("value", value);
    return true;
  }
}

export default {
  fetch: async (request, env, ctx) => {
    return router.handle(request, env, ctx).then(corsify);
  },
};
