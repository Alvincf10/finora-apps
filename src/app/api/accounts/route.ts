import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createAccountSchema } from "@/lib/validations";
import { Account } from "@/models/Account";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const accounts = await Account.find({ userId }).sort({ createdAt: -1 });
    return ok(accounts);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createAccountSchema.parse(await request.json());

    const account = await Account.create({
      userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      initialBalance: input.initialBalance,
      currentBalance: input.initialBalance,
      isActive: true,
    });

    return ok(account, 201);
  } catch (error) {
    return handleError(error);
  }
}
