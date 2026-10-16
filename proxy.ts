import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

const GUEST_ONLY_PATHS = ["/login", "/register", "/forgot-password"];
const NEUTRAL_PATHS = ["/auth/callback", "/reset-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // Local preview only: allow opening the app without Supabase env.
  // In production / Vercel, never skip auth gating — misconfigured env must not expose /dashboard.
  if (!isSupabaseConfigured) {
    const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    if (isProd && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isGuestOnly = GUEST_ONLY_PATHS.some((path) => pathname.startsWith(path));
  const isNeutral = NEUTRAL_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isGuestOnly && !isNeutral && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isGuestOnly) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
