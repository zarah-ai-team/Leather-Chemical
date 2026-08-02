import { getContext, errorResponse } from "@/server/context";
import { globalSearch } from "@/server/services/search";
import { rateLimit } from "@/server/ratelimit";

export async function GET(req: Request) {
  try {
    const ctx = await getContext();
    if (!rateLimit(`search:${ctx.userId}`, 120, 60_000)) {
      return Response.json({ error: "Too many searches" }, { status: 429 });
    }
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return Response.json({ data: await globalSearch(ctx, q.slice(0, 100)) });
  } catch (e) {
    return errorResponse(e);
  }
}
