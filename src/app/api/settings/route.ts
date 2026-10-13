import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateSettingsSchema } from "@/lib/validations";
import { User } from "@/models/User";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("NOT_FOUND");

    return ok({
      paydayDay: user.paydayDay ?? 25,
      monthlySalary: user.monthlySalary ?? 0,
      baseCurrency: user.baseCurrency ?? "IDR",
      timezone: user.timezone ?? "Asia/Jakarta",
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = updateSettingsSchema.parse(await request.json());

    const $set: Record<string, number> = {};
    if (input.paydayDay !== undefined) $set.paydayDay = input.paydayDay;
    if (input.monthlySalary !== undefined) {
      $set.monthlySalary = input.monthlySalary;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true, runValidators: true }
    ).lean();

    if (!user) throw new Error("NOT_FOUND");

    return ok({
      paydayDay: user.paydayDay ?? 25,
      monthlySalary: user.monthlySalary ?? 0,
      baseCurrency: user.baseCurrency ?? "IDR",
      timezone: user.timezone ?? "Asia/Jakarta",
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    return handleError(error);
  }
}
