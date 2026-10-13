import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  await connectDB();
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    baseCurrency: session.user.baseCurrency ?? "IDR",
  };
}
