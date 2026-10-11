import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { addLeadAction } from "../../../actions";

export const metadata: Metadata = { title: "Add a lead" };

const SOURCES = ["Website", "Zillow", "Realtor.com", "Facebook Lead Ads", "Google Ads", "Instagram", "Open House", "Referral", "Sign Call", "Email", "SMS", "Other"];

export default async function NewLeadPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Capture"
        title="Add a lead"
        subtitle="Met someone at an open house or got a call? Drop them in — they'll get the same instant care as every other lead."
      />
      <form action={addLeadAction} className="card card-pad space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <Field name="first_name" label="First name" required autoFocus />
          <Field name="last_name" label="Last name" />
          <Field name="phone" label="Mobile phone" type="tel" placeholder="(310) 555-0123" />
          <Field name="email" label="Email" type="email" placeholder="name@email.com" />
        </fieldset>
        <p className="-mt-3 text-xs text-slate-500">A phone or email is needed so we can follow up.</p>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="source">Where they came from</label>
            <select id="source" name="source" className="input" defaultValue="Open House">
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lead_type">Looking to</label>
            <select id="lead_type" name="lead_type" className="input" defaultValue="">
              <option value="">Not sure yet</option>
              <option value="buyer">Buy</option>
              <option value="seller">Sell</option>
              <option value="both">Buy & sell</option>
            </select>
          </div>
          <Field name="property" label="Property they asked about" placeholder="123 Ocean Ave" />
          <Field name="city" label="Area / city" placeholder="Manhattan Beach" />
          <Field name="price_range" label="Budget" placeholder="$900K – $1.2M" />
          <Field name="timeline" label="Timeline" placeholder="Next 60 days" />
        </fieldset>

        <div>
          <label className="label" htmlFor="message">What they said</label>
          <textarea id="message" name="message" rows={3} className="input" placeholder="In their words — we'll pick up buying signals automatically." />
        </div>

        {/* Hidden "no" comes first; if the box is checked its "yes" comes later and wins. */}
        <input type="hidden" name="sms_consent" value="no" />
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300">
          <input type="checkbox" name="sms_consent" value="yes" defaultChecked className="mt-0.5 h-4 w-4 accent-ember-500" />
          <span>
            <span className="font-semibold text-white">They agreed to receive texts.</span> Uncheck if they
            didn&apos;t — we&apos;ll stick to email.
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5">
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Sparkles className="h-4 w-4 text-ember-300" /> A personal follow-up plan is built instantly.
          </p>
          <button className="btn-primary">Add & build plan</button>
        </div>
      </form>
    </div>
  );
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" {...rest} />
    </div>
  );
}
