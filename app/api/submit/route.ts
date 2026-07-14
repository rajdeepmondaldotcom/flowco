import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { costCenterFor } from "@/lib/costCenters";
import { isSupabaseMode, nextSubmittedId, putExpense, supabase } from "@/lib/store";
import type { Employee, TriagedExpense } from "@/lib/types";

// Storage upload of a receipt photo/PDF can take a while on a cold lambda.
export const maxDuration = 60;

// Currencies the product handles end-to-end — matches data/policy.json fxToUsd
// and the extraction schema in lib/extract.ts.
const RECEIPT_CURRENCIES = new Set(["USD", "INR", "SGD"]);

// Uploaded receipts (photo or PDF): Supabase Storage in deployed mode (lambda
// filesystems are ephemeral), local public/uploads in dev.
async function storeReceipt(
  id: string,
  fileBase64: string,
  fileMediaType: string | undefined
): Promise<string> {
  const ext = fileMediaType === "application/pdf" ? "pdf" : fileMediaType === "image/jpeg" ? "jpg" : "png";
  const name = `${id.toLowerCase()}.${ext}`;
  const buffer = Buffer.from(fileBase64, "base64");

  if (isSupabaseMode()) {
    const { error } = await supabase()
      .storage.from("receipts")
      .upload(`uploads/${name}`, buffer, {
        contentType: fileMediaType ?? "image/png",
        upsert: true,
      });
    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    const { data } = supabase().storage.from("receipts").getPublicUrl(`uploads/${name}`);
    return data.publicUrl;
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);
  return `/uploads/${name}`;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    employee: Employee;
    draft: {
      merchant: string | null;
      category: "meals" | "travel" | "lodging" | "software" | "other" | null;
      receiptCurrency?: string | null;
      transactionDate: string | null;
      amount: number | null;
      tax: number | null;
      tip: number | null;
      total: number | null;
      purpose: string | null;
      project: string | null;
    };
    fileBase64?: string;
    fileMediaType?: string;
    imageBase64?: string;
    imageMediaType?: string;
  };
  const { employee, draft } = body;
  const fileBase64 = body.fileBase64 ?? body.imageBase64;
  const fileMediaType = body.fileMediaType ?? body.imageMediaType;

  if (!employee || !draft) {
    return NextResponse.json(
      { error: "An employee and an expense draft are required" },
      { status: 400 }
    );
  }
  if (!draft.total || !draft.merchant) {
    return NextResponse.json(
      { error: "A merchant and a total are required before submitting" },
      { status: 400 }
    );
  }
  for (const field of ["amount", "tax", "tip", "total"] as const) {
    const value = draft[field];
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return NextResponse.json(
        { error: `Invalid ${field} — amounts must be non-negative numbers` },
        { status: 400 }
      );
    }
  }
  const receiptCurrency = String(draft.receiptCurrency || "USD").trim().toUpperCase();
  if (!RECEIPT_CURRENCIES.has(receiptCurrency)) {
    return NextResponse.json(
      { error: `Unsupported receipt currency "${draft.receiptCurrency}" — expected USD, INR, or SGD` },
      { status: 400 }
    );
  }

  const id = await nextSubmittedId();
  let receiptUrl: string | null = null;
  if (fileBase64) {
    receiptUrl = await storeReceipt(id, fileBase64, fileMediaType);
  }

  const expense: TriagedExpense = {
    id,
    employee,
    purpose: draft.purpose ?? "(no purpose given)",
    project: draft.project ?? "—",
    category: draft.category ?? "other",
    merchant: draft.merchant,
    transactionDate: draft.transactionDate ?? new Date().toISOString().slice(0, 10),
    currency: "USD",
    receiptCurrency,
    amount: draft.amount ?? draft.total,
    tax: draft.tax ?? 0,
    tip: draft.tip ?? 0,
    total: draft.total,
    costCenter: costCenterFor(employee.department),
    receiptUrl,
    submittedAt: new Date().toISOString(),
    status: "pending",
    checks: null,
    aiVerdict: null,
    audit: [
      {
        at: new Date().toISOString(),
        actor: "assistant",
        action: "conversational submit",
        detail: `Filled from a one-line description${receiptUrl ? " + receipt photo" : ""} by ${employee.name}`,
      },
    ],
  };

  await putExpense(expense);
  return NextResponse.json({ expense });
}
