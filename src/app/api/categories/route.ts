import { ok, handleError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { categoryMeta } from "@/lib/seed/categories";
import { createCategorySchema } from "@/lib/validations";
import { Category } from "@/models/Category";

export async function GET() {
  try {
    const { userId } = await requireUser();
    const categories = await Category.find({
      userId,
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
    const meta = categoryMeta(input.name, input.type);

    const category = await Category.create({
      userId,
      name: input.name.trim(),
      type: input.type,
      parentId: input.parentId || undefined,
      icon: input.icon,
      color: input.color,
      classification: meta.classification,
      nature: meta.nature,
      isSystem: false,
      isActive: true,
    });

    return ok(category, 201);
  } catch (error) {
    return handleError(error);
  }
}
