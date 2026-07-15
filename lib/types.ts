export type Category = "meals" | "travel" | "lodging" | "software" | "other";

export type ExpenseStatus =
  | "pending" // submitted, not yet triaged
  | "triaged" // triage verdict attached, awaiting approver action
  | "approved"
  | "rejected"
  | "info_requested";

export interface Employee {
  name: string;
  email: string;
  department: string;
}

export interface Expense {
  id: string;
  employee: Employee;
  purpose: string;
  project: string;
  category: Category;
  merchant: string;
  transactionDate: string; // ISO date
  currency: string; // currency of the claim (always USD at FlowCo)
  receiptCurrency: string; // currency printed on the receipt
  amount: number; // pre-tax
  tax: number;
  tip: number;
  total: number; // claimed total
  costCenter: string;
  receiptUrl: string | null;
  submittedAt: string;
  status: ExpenseStatus;
}

// ---- Deterministic checks (pure code, no LLM) ----

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface PolicyCheck {
  status: CheckStatus;
  cap: number;
  total: number;
  overBy: number;
  note: string;
}

export interface ReceiptPresenceCheck {
  status: CheckStatus;
  required: boolean;
  present: boolean;
  note: string;
}

export interface DuplicateCheck {
  status: CheckStatus;
  candidateIds: string[];
  note: string;
}

export interface AmountLimitCheck {
  status: CheckStatus;
  autoApproveLimit: number;
  hardReviewLimit: number;
  note: string;
}

export interface CurrencyCheck {
  status: CheckStatus;
  note: string;
}

export interface CostCenterCheck {
  status: CheckStatus;
  expected: string;
  actual: string;
  note: string;
}

export interface DeterministicChecks {
  policyCap: PolicyCheck;
  receiptPresence: ReceiptPresenceCheck;
  duplicate: DuplicateCheck;
  amountLimit: AmountLimitCheck;
  currency: CurrencyCheck;
  costCenter: CostCenterCheck;
}

// ---- AI verdict (Claude output, schema-constrained) ----

export interface ReceiptExtraction {
  merchant: string | null;
  date: string | null;
  currency: string | null;
  printedTotal: number | null;
  handwrittenAdjustment: number | null; // e.g. a handwritten tip
  finalTotal: number | null; // model's best read of what was actually paid
  lineNotes: string; // anything odd the model noticed on the receipt
  legibilityConfidence: "high" | "medium" | "low";
}

// Line items the receipt shows that policy says FlowCo won't reimburse (e.g.
// alcohol). Deterministic code can't find these — they're only visible by
// reading the receipt — so this is entirely the model's contribution.
export interface NonReimbursable {
  items: { description: string; amount: number }[];
  subtotalExcluded: number; // includes any tax attributable to these items
  currency: string;
  note: string;
}

// When the receipt currency differs from the claim currency, the model does
// the FX reconciliation code can't (rates aren't in the app).
export interface CurrencyReconciliation {
  receiptCurrency: string;
  receiptTotal: number | null;
  claimCurrency: string;
  claimedTotal: number;
  impliedRate: number | null; // claimedTotal per 1 receiptCurrency unit
  plausible: boolean;
  note: string;
}

export type RecommendedAction = "approve" | "reject" | "request_info";

export interface TriageVerdict {
  verdict: "clear" | "needs_human";
  confidence: number; // 0-1, model's own confidence in its recommendation
  receiptExtraction: ReceiptExtraction | null;
  receiptMatch: {
    // "not_a_receipt" = the uploaded file isn't a receipt/invoice at all
    // (a poster, a screenshot, a book, a random photo). The model must say so
    // and never fabricate a reconciliation from junk.
    status: "match" | "mismatch" | "uncertain" | "no_receipt" | "not_a_receipt";
    claimedTotal: number;
    extractedTotal: number | null;
    note: string;
  };
  nonReimbursable: NonReimbursable | null;
  currencyReconciliation: CurrencyReconciliation | null;
  categoryLooksWrong: boolean; // filed category doesn't fit the merchant/receipt
  categoryNote: string; // if wrong: what it should be + the cap it would breach; else ""
  dateNote: string; // if the receipt date != claimed date, explain; else ""
  reimbursableAmount: {
    value: number;
    currency: string;
    note: string; // how it was derived (claim minus exclusions, etc.)
  } | null;
  summary: string; // 1-2 sentence plain-English case summary for the queue
  unresolved: string[]; // specifically what the assistant could NOT resolve
  recommendedAction: RecommendedAction;
  rationale: string; // why this recommendation
  draftEmployeeMessage: string | null; // pre-drafted message if info is needed
  engine: "claude" | "mock";
  model?: string;
  triagedAt: string;
}

export interface AuditEntry {
  at: string;
  actor: "assistant" | "approver";
  action: string;
  detail: string;
}

export interface TriagedExpense extends Expense {
  checks: DeterministicChecks | null;
  aiVerdict: TriageVerdict | null;
  audit: AuditEntry[];
}

export interface Policy {
  claimCurrency: string;
  categoryCaps: Record<Category, number>;
  receiptRequiredAbove: number;
  autoApproveLimit: number;
  hardReviewLimit: number;
  duplicateWindowDays: number;
  fxToUsd: Record<string, number>;
  fxNote: string;
  reimbursement: {
    alcohol: "not_reimbursable" | "reimbursable";
    note: string;
  };
  notes: string[];
}
