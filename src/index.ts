import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { DurableObject } from "cloudflare:workers";
import { HudDownloadGet, HudDownloadStat } from "endpoints/hudDownloadStat";
import {
  ServerListHello,
  ServerListQuery,
  ServerListUpdate,
} from "endpoints/quickplay";
import { createCors } from "itty-router";

export interface Env {
  HUD_COUNT: DurableObjectNamespace<Counter>;
  QUICKPLAY: KVNamespace;
}

const { preflight, corsify } = createCors();

export const router = OpenAPIRouter({
  docs_url: "/",
});

router.all("*", preflight);
router.post("/api/huds/download/add", HudDownloadStat);
router.post("/api/huds/download/get", HudDownloadGet);
router.post("/api/quickplay/hello", ServerListHello);
router.post("/api/quickplay/list", ServerListQuery);
router.post("/api/quickplay/update", ServerListUpdate);

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

  async getCounterValue() {
    let value = (await this.ctx.storage.get("value")) || 0;
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
    if (now - last < HudDownloadCounter.milliseconds_per_request) {
      return false;
    }
    knownIpBlocks[ip] = now;
    await this.ctx.storage.put("known", knownIpBlocks);
    let value: number = await this.getCounterValue();
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
