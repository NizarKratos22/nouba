import { ApiError, handle, ok, readJson, requireUserApi } from "@/lib/api";
import { decideApproval } from "@/lib/circles/service";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user } = await requireUserApi();
  const { id } = await params;
  const body = await readJson<{ option?: string }>(req);
  const option = String(body.option ?? "");
  if (!option) throw new ApiError(400, "option", "Pick an option.");
  const result = await decideApproval({ approvalId: id, optionKey: option, organizerId: user._id.toString() });
  return ok(result);
});
