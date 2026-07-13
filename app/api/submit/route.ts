import { mkdir, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { isSupabaseMode, nextSubmittedId, putExpense, supabase } from "@/lib/store";
import type { Employee, TriagedExpense } from "@/lib/types";

const COST_CENTERS: Record<string, string> = {
  Sales: "CC-2100 Sales",
  "Customer Success": "CC-2400 CS",
  Engineering: "CC-3100 Engineering",
  Marketing: "CC-2600 Marketing",
  Product: "CC-3300 Product",
};

// Uploaded receipts: Supabase Storage in deployed mode (lambda filesystems are
// ephemeral), local public/uploads in dev.
async function storeReceipt(
  id: string,
  imageBase64: string,
  imageMediaType: string | undefined
): Promise<string> {
  const ext = imageMediaType === "image/jpeg" ? "jpg" : "png";
  const name = `${id.toLowerCase()}.${ext}`;
  const buffer = Buffer.from(imageBase64, "base64");

  if (isSupabaseMode()) {
    const { error } = await supabase()
      .storage.from("receipts")
      .upload(`uploads/${name}`, buffer, {
        contentType: imageMediaType ?? "image/png",
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
  const { employee, draft, imageBase64, imageMediaType } = (await request.json()) as {
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
    imageBase64?: string;
    imageMediaType?: string;
  };

  if (!draft.total || !draft.merchant) {
    return NextResponse.json(
      { error: "A merchant and a total are required before submitting" },
      { status: 400 }
    );
  }

  const id = await nextSubmittedId();
  let receiptUrl: string | null = null;
  if (imageBase64) {
    receiptUrl = await storeReceipt(id, imageBase64, imageMediaType);
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
    receiptCurrency: (draft.receiptCurrency || "USD").toUpperCase().slice(0, 3),
    amount: draft.amount ?? draft.total,
    tax: draft.tax ?? 0,
    tip: draft.tip ?? 0,
    total: draft.total,
    costCenter: COST_CENTERS[employee.department] ?? "CC-0000",
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
