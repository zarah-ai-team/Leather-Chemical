import { NextRequest, NextResponse } from "next/server";

// Simple password gate. Enabled only when APP_USER and APP_PASSWORD are set as
// environment variables (e.g. in the hosting dashboard). Over HTTPS the
// credentials are encrypted in transit. Leaving the vars unset keeps the app
// open — convenient for local development.
export function middleware(req: NextRequest) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;

  // Auth disabled if not configured.
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      // malformed header — fall through to challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LeatherChem TMS"' },
  });
}

// Protect everything except Next.js internals and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
