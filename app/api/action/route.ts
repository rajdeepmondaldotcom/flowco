import { NextRequest, NextResponse } from "next/server";
import { getExpense, putExpense } from "@/lib/store";
import type { ExpenseStatus } from "@/lib/types";

const ACTION_TO_STATUS: Record<string, ExpenseStatus> = {
  approve: "approved",
  reject: "rejected",
  request_info: "info_requested",
};

export async function POST(request: NextRequest) {
  const { id, action, message } = await request.json();
  const expense = await getExpense(id);
  if (!expense) {
    return NextResponse.json({ error: `Unknown expense ${id}` }, { status: 404 });
  }

  // Undo: return a resolved expense to the review lane.
  if (action === "revert") {
    expense.status = "triaged";
    expense.audit.push({
      at: new Date().toISOString(),
      actor: "approver",
      action: "revert",
      detail: "Decision undone — back in the review queue",
    });
    await putExpense(expense);
    return NextResponse.json({ expense });
  }

  const status = ACTION_TO_STATUS[action];
  if (!status) {
    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
  }
  expense.status = status;
  expense.audit.push({
    at: new Date().toISOString(),
    actor: "approver",
    action,
    detail:
      action === "request_info" && message
        ? `Message sent to ${expense.employee.name}: "${message}"`
        : `Approver ${action === "approve" ? "approved" : "rejected"} the expense`,
  });
  await putExpense(expense);
  return NextResponse.json({ expense });
}
