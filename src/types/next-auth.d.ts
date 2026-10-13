import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      baseCurrency: string;
    };
  }

  interface User {
    baseCurrency?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    baseCurrency?: string;
  }
}
