import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class MangaStudioContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2h";
  envVars = {
    PORT: "8080",
    FLASK_SECRET: env.FLASK_SECRET || "",
    ADMIN_PASSWORD: env.ADMIN_PASSWORD || "",
    ARK_API_KEY: env.ARK_API_KEY || "",
    TOS_AK: env.TOS_AK || "",
    TOS_SK: env.TOS_SK || "",
    NANO_GPT_API_KEY: env.NANO_GPT_API_KEY || "",
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_KEY: env.SUPABASE_KEY || "",
    THIRD_PARTY_API_BASE: env.THIRD_PARTY_API_BASE || "",
    THIRD_PARTY_API_KEY: env.THIRD_PARTY_API_KEY || "",
    MAX_UPLOAD_MB: env.MAX_UPLOAD_MB || "512"
  };
}

export default {
  async fetch(request, env) {
    const container = getContainer(env.MANGA_STUDIO, "web");
    return container.fetch(request);
  }
};
