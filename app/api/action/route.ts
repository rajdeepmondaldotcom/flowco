import { NextRequest, NextResponse } from "next/server";
import { getExpense, putExpense } from "@/lib/store";
import type { ExpenseStatus } from "@/lib/types";

const ACTION_TO_STATUS: Record<string, ExpenseStatus> = {
  approve: "approved",
  reject: "rejected",
  request_info: "info_requested",
};

const VALID_ACTIONS = new Set(["approve", "reject", "request_info", "revert"]);

export async function POST(request: NextRequest) {
  let id: unknown, action: unknown, message: unknown;
  try {
    ({ id, action, message } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected JSON" }, { status: 400 });
  }
  if (typeof id !== "string" || id === "") {
    return NextResponse.json({ error: "An expense id is required" }, { status: 400 });
  }
  // Allowlist (not a bare object lookup) so inherited keys like "toString"
  // can never sneak through as an action.
  if (typeof action !== "string" || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Unknown action ${action} — expected approve, reject, request_info, or revert` },
      { status: 400 }
    );
  }
  // The audit trail is permanent; a free-text message must be bounded like
  // every other free-text field in the app.
  if (message != null && (typeof message !== "string" || message.length > 2000)) {
    return NextResponse.json(
      { error: "The message must be text of at most 2,000 characters" },
      { status: 400 }
    );
  }

  try {
    const expense = await getExpense(id);
    if (!expense) {
      return NextResponse.json({ error: `Unknown expense ${id}` }, { status: 404 });
    }

    // State machine: decisions act on triaged cases, undo acts on decided
    // ones. Anything else is a stale click or a replay — refuse it, so a
    // repeated action can't grow the audit trail or vanish a pending case.
    const RESOLVED = new Set(["approved", "rejected", "info_requested"]);
    if (action === "revert" && !RESOLVED.has(expense.status)) {
      return NextResponse.json(
        { error: `Only a decided expense can be undone (this one is ${expense.status})` },
        { status: 409 }
      );
    }
    if (action !== "revert" && expense.status !== "triaged") {
      return NextResponse.json(
        { error: `This expense is ${expense.status}, not awaiting a decision` },
        { status: 409 }
      );
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
  } catch (err) {
    console.error(`[api] action failed:`, err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Try again in a moment." },
      { status: 500 }
    );
  }
}
