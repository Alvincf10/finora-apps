import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { loginSchema } from "@/lib/validations";
import { authConfig } from "@/lib/auth.config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const emailKey = parsed.data.email.toLowerCase();
        const ip =
          request instanceof Request ? clientIp(request) : "unknown";

        // Dual bucket: per-email (credential stuffing one account) + per-IP (spray).
        if (!checkRateLimit(`login:email:${emailKey}`, 8, 15 * 60_000)) {
          return null;
        }
        if (!checkRateLimit(`login:ip:${ip}`, 30, 15 * 60_000)) {
          return null;
        }

        await connectDB();
        const user = await User.findOne({ email: emailKey });
        if (!user) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image ?? undefined,
          baseCurrency: user.baseCurrency,
        };
      },
    }),
  ],
});
