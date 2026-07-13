import type { DeterministicChecks, Expense, Policy } from "./types";

// Pure, deterministic checks. No LLM involvement — money math and duplicate
// detection stay in code. Any fail/warn here forces the case to a human
// regardless of what the model concludes.

const money = (n: number) => `$${n.toFixed(2)}`;

export function runChecks(expense: Expense, all: Expense[], policy: Policy): DeterministicChecks {
  return {
    policyCap: policyCapCheck(expense, policy),
    receiptPresence: receiptPresenceCheck(expense, policy),
    duplicate: duplicateCheck(expense, all, policy),
    amountLimit: amountLimitCheck(expense, policy),
    currency: currencyCheck(expense, policy),
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
  const candidates = all
    .filter(
      (other) =>
        other.id !== expense.id &&
        other.employee.email === expense.employee.email &&
        other.merchant.toLowerCase() === expense.merchant.toLowerCase() &&
        Math.abs(other.total - expense.total) < 0.005 &&
        Math.abs(new Date(other.transactionDate).getTime() - date) <= policy.duplicateWindowDays * dayMs
    )
    .map((other) => other.id);
  return {
    status: candidates.length > 0 ? ("warn" as const) : ("pass" as const),
    candidateIds: candidates,
    note:
      candidates.length > 0
        ? `Same employee, merchant, and amount within ${policy.duplicateWindowDays} days: ${candidates.join(", ")}`
        : "No duplicate candidates found",
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
