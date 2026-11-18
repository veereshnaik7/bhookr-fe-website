"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  FlaskConical,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase/config";
import {
  CRM_ROLES,
  CRM_DEMO_PASSWORD,
  loginAs,
  getCurrentRole,
  type CrmRole,
} from "@/lib/crm/auth";

export default function CrmLoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<CrmRole>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const forceBypass = false; // Disable local bypass mode

  // If already logged in, redirect directly to dashboard
  useEffect(() => {
    const currentRole = getCurrentRole();
    if (currentRole) {
      router.push("/crm/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isFirebaseConfigured && !forceBypass) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          const user = userCredential.user;
          const token = await user.getIdToken();

          const res = await fetch("/api/crm/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });

          const data = await res.json();

          if (!res.ok || !data.success) {
            await signOut(auth);
            throw new Error(data.error || "Access denied: Insufficient permissions.");
          }

          loginAs(data.role as CrmRole);
          router.push("/crm/dashboard");
          return;
        } catch (clientErr: any) {
          // If client-side network failed (e.g. adblocker, corporate firewall, DNS),
          // fallback seamlessly to server-side login endpoint
          if (
            clientErr.code === "auth/network-request-failed" ||
            clientErr.message?.includes("network-request-failed")
          ) {
            console.warn("[CRM Auth] Client network failed, falling back to server-side login...");
            const serverRes = await fetch("/api/crm/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });

            const serverData = await serverRes.json();
            if (serverRes.ok && serverData.success) {
              loginAs(serverData.role as CrmRole);
              router.push("/crm/dashboard");
              return;
            }
            throw new Error(serverData.error || "Authentication failed. Please check credentials.");
          }
          throw clientErr;
        }
      } else {
        // Fallback: Local Development Bypass
        if (password !== CRM_DEMO_PASSWORD) {
          throw new Error("Incorrect password");
        }

        loginAs(role);
        router.push("/crm/dashboard");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      let errMsg = err.message || "An unexpected error occurred during sign in.";
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        errMsg = "Invalid email or password. Please try again.";
      }
      setError(errMsg);
      setSubmitting(false);
    }
  };

  const inputClass =
    "block h-11 w-full rounded-crm border border-crm-line bg-crm-surface pl-10 pr-3 text-sm text-crm-ink placeholder:text-crm-muted/70 transition-colors hover:border-crm-line-strong focus:border-crm-ink focus:outline-none focus:ring-2 focus:ring-crm-ink/10 disabled:opacity-60";
  const labelClass = "mb-1.5 block text-sm font-medium text-crm-ink";
  const iconClass = "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted";
  const devMode = !isFirebaseConfigured || forceBypass;

  return (
    <main className="grid min-h-screen bg-crm-cream lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Brand panel (laptop and up) ─────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-crm-ink p-12 text-crm-cream lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-crm-red/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-crm bg-crm-red text-white">
            <UtensilsCrossed className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="crm-display text-xl text-white">Bhookr</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-crm-cream/50">Sales CRM</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.75rem] text-white">
            Every lead, <span className="text-crm-red">one pipeline.</span>
          </h2>
          <p className="mt-4 text-base text-crm-cream/70">
            Track every enquiry from the website and Google Forms, follow up on time and turn
            interest into subscriptions.
          </p>
        </div>

        <p className="relative text-xs text-crm-cream/40">© {new Date().getFullYear()} Bhookr · Staff access only</p>
      </aside>

      {/* ── Sign-in form ────────────────────────────────────────────── */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          {/* Logo on mobile/tablet (brand panel is hidden there) */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-crm bg-crm-red text-white">
              <UtensilsCrossed className="h-5 w-5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="crm-display text-xl text-crm-ink">Bhookr</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-crm-muted">Sales CRM</p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-crm border border-crm-line bg-crm-surface shadow-[0_1px_2px_rgba(31,27,24,0.04),0_12px_32px_-12px_rgba(31,27,24,0.12)]"
            noValidate={false}
          >
            <div className="h-2 bg-crm-red" aria-hidden />
            <div className="p-6 sm:p-8">
              <div className="mb-7">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-crm-red-deep">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Staff access
                </p>
                <h1 className="mt-2 text-[1.9rem] text-crm-ink">Welcome back</h1>
                <p className="mt-1 text-sm text-crm-muted">Sign in to manage leads and follow-ups.</p>
              </div>

              <div className="space-y-5">
                {devMode && (
                  <div className="flex items-start gap-2.5 rounded-crm border border-crm-line bg-crm-cream px-3 py-2.5 text-xs text-crm-ink-soft">
                    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-crm-red" aria-hidden />
                    <span>
                      <strong className="font-semibold text-crm-ink">Development bypass mode.</strong> Firebase isn&apos;t
                      configured. Pick a role and enter the shared password.
                    </span>
                  </div>
                )}

                {!devMode ? (
                  <div>
                    <label htmlFor="email" className={labelClass}>
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className={iconClass} aria-hidden />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@bhookr.com"
                        autoComplete="email"
                        className={inputClass}
                        disabled={submitting}
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="role" className={labelClass}>
                      Role
                    </label>
                    <div className="relative">
                      <UserRound className={iconClass} aria-hidden />
                      <select
                        id="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as CrmRole)}
                        className={`${inputClass} appearance-none pr-9`}
                        disabled={submitting}
                      >
                        {CRM_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
                        aria-hidden
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="password" className={labelClass}>
                    {devMode ? "Shared password" : "Password"}
                  </label>
                  <div className="relative">
                    <Lock className={iconClass} aria-hidden />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className={`${inputClass} pr-11`}
                      disabled={submitting}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-crm border border-crm-red/30 bg-crm-red-soft px-3 py-2.5 text-sm text-crm-red-deep"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-crm bg-crm-red px-4 text-sm font-semibold text-white transition-colors hover:bg-crm-red-hover active:bg-crm-red-deep disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 border-t border-crm-line bg-crm-cream/60 px-6 py-3.5 text-xs text-crm-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {isFirebaseConfigured
                ? "Secured with Firebase authentication"
                : "Prototype build — temporary shared password"}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
