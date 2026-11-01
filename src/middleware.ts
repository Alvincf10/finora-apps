import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Protect app pages + API. Skip Next internals and static assets.
     * /api/auth/* stays public via authorized() callback.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|webmanifest)$|sw\\.js|offline\\.html|manifest\\.webmanifest).*)",
  ],
};
