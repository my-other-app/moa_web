import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth-frame";
import { ForgotPassword } from "@/features/password-reset";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

/** Public: someone who forgot their password has no session. The mailed code is the key. */
export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      headline="Everything your club runs, in one place."
      points={["Events, tickets and the people who come", "The door: check-ins, ID cards and the gate", "Money, certificates and the closeout"]}
      foot="One login per club, shared by its committee."
    >
      <h1 className="page-title">Reset your password</h1>
      <div className="mt-6">
        <ForgotPassword />
      </div>
    </AuthFrame>
  );
}
