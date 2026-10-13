import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isAuthPage =
        pathname.startsWith("/login") || pathname.startsWith("/register");
      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/transactions") ||
        pathname.startsWith("/accounts") ||
        pathname.startsWith("/budget") ||
        pathname.startsWith("/debts") ||
        pathname.startsWith("/fixed-costs") ||
        pathname.startsWith("/goals") ||
        pathname.startsWith("/reports") ||
        pathname.startsWith("/insights") ||
        pathname.startsWith("/simulator") ||
        pathname.startsWith("/settings");

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      if (isProtected) {
        return isLoggedIn;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.baseCurrency =
          (user as { baseCurrency?: string }).baseCurrency ?? "IDR";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.baseCurrency =
          (token.baseCurrency as string) ?? "IDR";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
