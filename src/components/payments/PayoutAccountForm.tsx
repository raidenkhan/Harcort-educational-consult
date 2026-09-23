"use client";

import { useActionState } from "react";
import { Smartphone } from "lucide-react";
import { savePayoutAccount } from "@/services/payments/mutations";
import type { PaymentFormState } from "@/services/payments/mutations";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Fields";

/**
 * MoMo payout account form — where the tutor's earnings go.
 *
 * One account per tutor (upsert server-side). Until an admin confirms the
 * ₵1 verification ping, the account stays "unverified" and payouts are
 * refused by the DB guard — the badge makes that state visible.
 */
export function PayoutAccountForm({
  account,
}: {
  account: {
    provider: "mtn" | "telecel" | "airteltigo";
    phone: string;
    accountName: string | null;
    verified: boolean;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    savePayoutAccount,
    {},
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
            <Smartphone className="h-4 w-4 text-brand-700" />
          </span>
          <h3 className="text-lg font-semibold text-slate-900">
            Mobile money payout account
          </h3>
        </div>
        {account ? (
          <Badge tone={account.verified ? "green" : "amber"}>
            {account.verified ? "Verified" : "Saved — verification pending"}
          </Badge>
        ) : (
          <Badge tone="neutral">Not set up</Badge>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-600">
        Payouts are sent to MoMo after your sessions are complete and the
        student has paid in full. Double-check the number — a wrong number
        sends your money elsewhere.
      </p>

      {account && !state.error && (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Current account: <strong>{account.provider.toUpperCase()}</strong>{" "}
          {account.phone}
          {account.accountName ? ` · ${account.accountName}` : ""}
        </p>
      )}

      {state?.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.message}
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <Field label="Network" htmlFor="provider">
          <Select id="provider" name="provider" required defaultValue={account?.provider ?? ""}>
            <option value="" disabled>
              Choose your network…
            </option>
            <option value="mtn">MTN MoMo</option>
            <option value="telecel">Telecel Cash</option>
            <option value="airteltigo">AirtelTigo Money</option>
          </Select>
        </Field>
        <Field
          label="Mobile money number"
          htmlFor="phone"
          hint="The number registered to the wallet, e.g. 0241234567"
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            inputMode="tel"
            placeholder="0241234567"
            defaultValue={account?.phone ?? ""}
          />
        </Field>
        <Field label="Account name" htmlFor="accountName" hint="As registered on the wallet">
          <Input
            id="accountName"
            name="accountName"
            type="text"
            placeholder="Your full name"
            defaultValue={account?.accountName ?? ""}
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : account ? "Update account" : "Save account"}
        </Button>
      </form>
    </Card>
  );
}
