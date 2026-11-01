import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { updateSettingsSchema } from "@/lib/validations";
import { User } from "@/models/User";

function serializeSettings(user: {
  paydayDay?: number | null;
  monthlySalary?: number | null;
  baseCurrency?: string | null;
  timezone?: string | null;
  name?: string | null;
  email?: string | null;
  roadmapPreferences?: { educationGoalApplicability?: string } | null;
  decisionPreference?: string | null;
  aiAssistEnabled?: boolean | null;
}) {
  return {
    paydayDay: user.paydayDay ?? 25,
    monthlySalary: user.monthlySalary ?? 0,
    baseCurrency: user.baseCurrency ?? "IDR",
    timezone: user.timezone ?? "Asia/Jakarta",
    name: user.name,
    email: user.email,
    educationGoalApplicability:
      user.roadmapPreferences?.educationGoalApplicability ?? "UNSET",
    decisionPreference: user.decisionPreference ?? "UNSET",
    aiAssistEnabled: Boolean(user.aiAssistEnabled),
  };
}

export async function GET() {
  try {
    const { userId } = await requireUser();
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("NOT_FOUND");
    return ok(serializeSettings(user));
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = updateSettingsSchema.parse(await request.json());

    const $set: Record<string, string | number | boolean> = {};
    if (input.paydayDay !== undefined) $set.paydayDay = input.paydayDay;
    if (input.monthlySalary !== undefined) {
      $set.monthlySalary = input.monthlySalary;
    }
    if (input.educationGoalApplicability !== undefined) {
      $set["roadmapPreferences.educationGoalApplicability"] =
        input.educationGoalApplicability;
    }
    if (input.decisionPreference !== undefined) {
      $set.decisionPreference = input.decisionPreference;
    }
    if (input.aiAssistEnabled !== undefined) {
      $set.aiAssistEnabled = input.aiAssistEnabled;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true, runValidators: true }
    ).lean();

    if (!user) throw new Error("NOT_FOUND");
    return ok(serializeSettings(user));
  } catch (error) {
    return handleError(error);
  }
}
