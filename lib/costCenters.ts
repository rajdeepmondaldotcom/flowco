// Single source of truth for the GL cost center each department books to.
// A claim tagged to a different department's cost center is a likely mis-pick
// from the "long dropdown" the PDF describes — the deterministic check in
// lib/checks.ts surfaces it, and the conversational submit route uses the same
// map so a new expense is coded consistently.

export const DEPARTMENT_COST_CENTERS: Record<string, string> = {
  Sales: "CC-2100 Sales",
  "Customer Success": "CC-2400 CS",
  Product: "CC-3300 Product",
  Engineering: "CC-3100 Engineering",
  "Data Science": "CC-3200 Data Science",
  Marketing: "CC-2600 Marketing",
};

// Fallback GL code for a department we don't recognize — keeps the expense
// storable while making the mis-code obvious in the queue.
export const UNKNOWN_COST_CENTER = "CC-0000";

// The GL cost center a department books to, or the CC-0000 fallback.
// Object.hasOwn so inherited keys ("__proto__", "toString") can never resolve
// to a non-string through the prototype chain.
export function costCenterFor(department: string): string {
  return Object.hasOwn(DEPARTMENT_COST_CENTERS, department)
    ? DEPARTMENT_COST_CENTERS[department]
    : UNKNOWN_COST_CENTER;
}
