import type { DeterministicChecks, Expense, Policy } from "./types";

// Pure, deterministic checks. No LLM involvement — money math and duplicate
// detection stay in code. Any fail/warn here forces the case to a human
// regardless of what the model concludes.

const money = (n: number) => `$${n.toFixed(2)}`;

// The GL cost center each department books to. A claim tagged to a different
// department's cost center is a likely mis-pick from the "long dropdown" the
// PDF describes — surface it for the approver.
export const DEPARTMENT_COST_CENTERS: Record<string, string> = {
  Sales: "CC-2100 Sales",
  "Customer Success": "CC-2400 CS",
  Product: "CC-3300 Product",
  Engineering: "CC-3100 Engineering",
  Marketing: "CC-2600 Marketing",
};

export function runChecks(expense: Expense, all: Expense[], policy: Policy): DeterministicChecks {
  return {
    policyCap: policyCapCheck(expense, policy),
    receiptPresence: receiptPresenceCheck(expense, policy),
    duplicate: duplicateCheck(expense, all, policy),
    amountLimit: amountLimitCheck(expense, policy),
    currency: currencyCheck(expense, policy),
    costCenter: costCenterCheck(expense),
  };
}

function costCenterCheck(expense: Expense) {
  const expected = DEPARTMENT_COST_CENTERS[expense.employee.department] ?? "";
  // Compare on the CC code prefix so label variations don't cause noise.
  const code = (s: string) => s.trim().split(/\s+/)[0];
  const mismatch = expected !== "" && code(expense.costCenter) !== code(expected);
  return {
    status: mismatch ? ("warn" as const) : ("pass" as const),
    expected,
    actual: expense.costCenter,
    note: mismatch
      ? `Coded to ${expense.costCenter}, but ${expense.employee.name.split(" ")[0]} is in ${expense.employee.department} (${expected}) — possible mis-tag`
      : `Cost center ${expense.costCenter} matches ${expense.employee.department}`,
  };
}

function policyCapCheck(expense: Expense, policy: Policy) {
  const cap = policy.categoryCaps[expense.category];
  const overBy = Math.max(0, expense.total - cap);
  const over = overBy > 0.005;
  return {
    status: over ? ("fail" as const) : ("pass" as const),
    cap,
    total: expense.total,
    overBy: Number(overBy.toFixed(2)),
    note: over
      ? `${money(expense.total)} exceeds the ${expense.category} cap of ${money(cap)} by ${money(overBy)}`
      : `${money(expense.total)} is within the ${expense.category} cap of ${money(cap)}`,
  };
}

function receiptPresenceCheck(expense: Expense, policy: Policy) {
  const required = expense.total > policy.receiptRequiredAbove;
  const present = expense.receiptUrl !== null;
  const missing = required && !present;
  return {
    status: missing ? ("fail" as const) : ("pass" as const),
    required,
    present,
    note: missing
      ? `Receipt required over ${money(policy.receiptRequiredAbove)} but none attached`
      : !present
        ? `No receipt, but not required under ${money(policy.receiptRequiredAbove)}`
        : "Receipt attached",
  };
}

function duplicateCheck(expense: Expense, all: Expense[], policy: Policy) {
  const dayMs = 24 * 60 * 60 * 1000;
  const date = new Date(expense.transactionDate).getTime();
  // Flag two patterns for a human glance, and let the model characterize which:
  //  - same day, same merchant, same employee → possible split bill OR same-day
  //    re-submission (different or identical amounts).
  //  - same merchant, same employee, identical amount within the window →
  //    a delayed re-submission of the same bill.
  // A different-amount purchase from the same merchant on a *different* day is
  // just normal repeat business, not a duplicate — don't flag it.
  const matches = all.filter((other) => {
    if (other.id === expense.id) return false;
    if (other.employee.email !== expense.employee.email) return false;
    if (other.merchant.toLowerCase() !== expense.merchant.toLowerCase()) return false;
    const sameDay = other.transactionDate === expense.transactionDate;
    const amountMatch = Math.abs(other.total - expense.total) < 0.005;
    const withinWindow =
      Math.abs(new Date(other.transactionDate).getTime() - date) <= policy.duplicateWindowDays * dayMs;
    return sameDay || (amountMatch && withinWindow);
  });
  const candidates = matches.map((o) => o.id);
  const exactAmount = matches.some((o) => Math.abs(o.total - expense.total) < 0.005);
  return {
    status: candidates.length > 0 ? ("warn" as const) : ("pass" as const),
    candidateIds: candidates,
    note:
      candidates.length === 0
        ? "No duplicate candidates found"
        : exactAmount
          ? `Same employee, merchant, and amount within ${policy.duplicateWindowDays} days — possible re-submission: ${candidates.join(", ")}`
          : `Same employee and merchant within ${policy.duplicateWindowDays} days at different amounts — possible split bill or re-submission: ${candidates.join(", ")}`,
  };
}

function amountLimitCheck(expense: Expense, policy: Policy) {
  const status =
    expense.total > policy.hardReviewLimit
      ? ("fail" as const)
      : expense.total > policy.autoApproveLimit
        ? ("warn" as const)
        : ("pass" as const);
  return {
    status,
    autoApproveLimit: policy.autoApproveLimit,
    hardReviewLimit: policy.hardReviewLimit,
    note:
      status === "fail"
        ? `Over the ${money(policy.hardReviewLimit)} hard review limit — always requires manager review`
        : status === "warn"
          ? `Over the ${money(policy.autoApproveLimit)} one-click limit`
          : `Under the ${money(policy.autoApproveLimit)} one-click approval limit`,
  };
}

function currencyCheck(expense: Expense, policy: Policy) {
  const mismatch = expense.receiptCurrency !== policy.claimCurrency;
  return {
    status: mismatch ? ("warn" as const) : ("pass" as const),
    note: mismatch
      ? `Receipt is in ${expense.receiptCurrency} but the claim is in ${policy.claimCurrency} — conversion cannot be verified deterministically`
      : `Receipt and claim are both in ${policy.claimCurrency}`,
  };
}

// The routing guardrail: code decides whether a human must look, the model
// never gets to override a failed or warned check.
export function checksRequireHuman(checks: DeterministicChecks): boolean {
  return Object.values(checks).some((c) => c.status === "fail" || c.status === "warn");
}
