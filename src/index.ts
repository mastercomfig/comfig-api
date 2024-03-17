import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";
import { HudDownloadStat } from "./endpoints/hudDownloadStat";
export const router = OpenAPIRouter({
  docs_url: "/",
});

router.post("/api/huds/download", HudDownloadStat);

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

export default {
  fetch: router.handle,
};
