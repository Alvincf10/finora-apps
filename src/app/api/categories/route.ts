import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { createCategorySchema } from "@/lib/validations";
import { Category } from "@/models/Category";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const categories = await Category.find({
      $or: [{ userId }, { isSystem: true, userId }],
      isActive: true,
    }).sort({ type: 1, name: 1 });
    return ok(categories);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const input = createCategorySchema.parse(await request.json());

    const category = await Category.create({
      userId,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      icon: input.icon,
      color: input.color,
      isSystem: false,
      isActive: true,
    });

    return ok(category, 201);
  } catch (error) {
    return handleError(error);
  }
}
