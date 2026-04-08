
import React, { useState, useEffect, useCallback } from 'react';
import { CompanySubscription, PlanName, SubscriptionStatus, Company } from '../types.ts';
import { apiService } from '../services/apiService.ts';

interface BillingViewProps {
  companyId: string;
  companyName: string;
  isDarkMode?: boolean;
  isSuperAdmin?: boolean;
  allCompanies?: Company[];
}

interface PricingPlan {
  id: PlanName;
  label: string;
  monthlyPrice?: number;
  contactForQuote?: boolean;
  description: string;
  priceId?: string;
  features: string[];
  highlighted?: boolean;
}

// Replace these with your actual Stripe Price IDs from the Stripe Dashboard
const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'pro',
    label: 'Pro',
    monthlyPrice: 299,
    description: 'Everything your crew needs to manage dig tickets efficiently.',
    priceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID ?? 'price_pro_monthly',
    highlighted: true,
    features: [
      'Unlimited dig tickets',
      'Unlimited team members',
      'AI-powered ticket parsing',
      'PDF markup & annotations',
      'Map view with geocoding',
      'Field docs & photo storage',
      'Push notifications',
      'Priority email support',
    ],
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    contactForQuote: true,
    description: 'Custom branding, SLA, and dedicated support for large operations.',
    features: [
      'Everything in Pro',
      'Custom brand colors & logo',
      'Dedicated account manager',
      'SLA uptime guarantee',
      'Custom integrations & API access',
      'Advanced audit logs',
      'SSO / SAML authentication',
      'Onboarding & training sessions',
    ],
  },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:   { label: 'Active',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  trialing: { label: 'Trial',     color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25' },
  past_due: { label: 'Past Due',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25' },
  canceled: { label: 'Canceled',  color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/25' },
  inactive: { label: 'No Plan',   color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/25' },
};

const formatDate = (ts?: number): string => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
  </svg>
);

const BillingView: React.FC<BillingViewProps> = ({ companyId, companyName, isDarkMode, isSuperAdmin = false, allCompanies = [] }) => {
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Super admin manual override state
  const [overrideCompanyId, setOverrideCompanyId] = useState('');
  const [overridePlan, setOverridePlan] = useState<PlanName>('pro');
  const [overrideStatus, setOverrideStatus] = useState<SubscriptionStatus>('active');
  const [overridePeriodEnd, setOverridePeriodEnd] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideSuccess, setOverrideSuccess] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sub = await apiService.getSubscription(companyId);
      setSubscription(sub);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load subscription data.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // Check for success/cancel query params on return from Stripe
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      // Give Stripe webhook a moment to process, then refresh
      setTimeout(loadSubscription, 1500);
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      loadSubscription();
    }
  }, [loadSubscription]);

  const handleSubscribe = async (plan: PricingPlan) => {
    if (!plan.priceId) return;
    setCheckoutLoading(plan.id);
    setError(null);
    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?billing=success`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?billing=cancel`;
      const { url } = await apiService.createCheckoutSession(plan.priceId, successUrl, cancelUrl);
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start checkout.';
      setError(msg);
      setCheckoutLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const { url } = await apiService.createBillingPortalSession(returnUrl);
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open billing portal.';
      setError(msg);
      setPortalLoading(false);
    }
  };

  const handleAdminOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideCompanyId) return;
    setOverrideLoading(true);
    setOverrideError(null);
    setOverrideSuccess(false);
    try {
      await apiService.adminOverrideSubscription(
        overrideCompanyId,
        overridePlan,
        overrideStatus,
        overridePeriodEnd || undefined,
      );
      setOverrideSuccess(true);
      setTimeout(() => setOverrideSuccess(false), 4000);
    } catch (err: unknown) {
      setOverrideError(err instanceof Error ? err.message : 'Override failed.');
    } finally {
      setOverrideLoading(false);
    }
  };

  const isActivePlan = (planId: PlanName): boolean => {
    if (!subscription) return false;
    return subscription.planName === planId && (subscription.status === 'active' || subscription.status === 'trialing');
  };

  const isPaid = subscription?.status === 'active' || subscription?.status === 'trialing';
  const currentStatus = statusConfig[subscription?.status ?? 'inactive'];
  const currentPlan = PRICING_PLANS.find(p => p.id === subscription?.planName);

  const card = isDarkMode
    ? 'bg-[#0b1629] border-white/[0.07]'
    : 'bg-white border-slate-200';

  const subtleText = isDarkMode ? 'text-slate-500' : 'text-slate-400';
  const bodyText = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const headingText = isDarkMode ? 'text-white' : 'text-slate-900';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={`text-xl font-black uppercase tracking-wide ${headingText}`}>Billing &amp; Subscription</h1>
          <p className={`text-xs mt-1 ${subtleText}`}>{companyName}</p>
        </div>
        {isPaid && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${
              isDarkMode
                ? 'border-white/10 text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5'
                : 'border-slate-200 text-slate-600 hover:text-brand hover:border-brand/40 hover:bg-brand/5'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {portalLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            Manage Subscription
          </button>
        )}
      </div>

      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-semibold">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* ── CURRENT PLAN CARD ── */}
      <div className={`rounded-2xl border p-6 ${card}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-brand/15 border border-brand/25 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <p className={`text-[13px] font-black uppercase tracking-wide ${headingText}`}>
                  {isLoading ? 'Loading...' : (currentPlan?.label ?? 'No Active Plan')}
                </p>
                {!isLoading && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${currentStatus.color} ${currentStatus.bg} ${currentStatus.border}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isPaid ? 'bg-emerald-400' : 'bg-slate-500'} inline-block`} />
                    {currentStatus.label}
                  </span>
                )}
              </div>
              {isLoading ? (
                <div className="w-32 h-3 rounded-full bg-white/5 animate-pulse mt-1.5" />
              ) : isPaid && subscription?.currentPeriodEnd ? (
                <p className={`text-[11px] mt-0.5 ${subtleText}`}>
                  {subscription.cancelAtPeriodEnd ? (
                    <span className="text-amber-400">Cancels on {formatDate(subscription.currentPeriodEnd)}</span>
                  ) : (
                    <>Renews {formatDate(subscription.currentPeriodEnd)}</>
                  )}
                </p>
              ) : (
                <p className={`text-[11px] mt-0.5 ${subtleText}`}>No active subscription — choose a plan below</p>
              )}
            </div>
          </div>

          {isPaid && currentPlan?.monthlyPrice && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDarkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-slate-50 border-slate-100'}`}>
              <div className="text-right">
                <p className={`text-[9px] font-black uppercase tracking-widest ${subtleText}`}>Monthly</p>
                <p className={`text-xl font-black ${headingText}`}>
                  ${currentPlan.monthlyPrice}
                  <span className={`text-[10px] font-bold ${subtleText}`}>/mo</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PRICING PLANS ── */}
      <div>
        <h2 className={`text-[11px] font-black uppercase tracking-widest mb-4 ${subtleText}`}>
          {isPaid ? 'Available Plans' : 'Choose a Plan'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRICING_PLANS.map((plan) => {
            const isActive = isActivePlan(plan.id);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-6 flex flex-col gap-5 transition-all ${
                  plan.highlighted
                    ? 'border-brand/40 bg-brand/5'
                    : isDarkMode
                    ? 'border-white/[0.07] bg-[#0b1629]'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-5">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-brand text-[#07101f] shadow-md shadow-brand/20">
                      Most Popular
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className={`text-[13px] font-black uppercase tracking-wide ${headingText}`}>{plan.label}</p>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                        Current Plan
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    {plan.contactForQuote ? (
                      <span className={`text-2xl font-black ${headingText}`}>Custom Pricing</span>
                    ) : (
                      <>
                        <span className={`text-3xl font-black ${headingText}`}>${plan.monthlyPrice}</span>
                        <span className={`text-[11px] font-bold ${subtleText}`}>/month</span>
                      </>
                    )}
                  </div>
                  <p className={`text-[11px] mt-2 leading-relaxed ${bodyText}`}>{plan.description}</p>
                </div>

                <ul className="flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="text-brand shrink-0 mt-0.5">
                        <CheckIcon className="w-3.5 h-3.5" />
                      </span>
                      <span className={`text-[11px] font-semibold ${bodyText}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.contactForQuote ? (
                  <a
                    href="mailto:sales@digtrackpro.com?subject=Enterprise%20Plan%20Inquiry"
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border ${
                      isDarkMode
                        ? 'border-white/10 text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5'
                        : 'border-slate-200 text-slate-600 hover:text-brand hover:border-brand/40'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Contact Sales
                  </a>
                ) : (
                  <button
                    onClick={() => !isActive && handleSubscribe(plan)}
                    disabled={isActive || checkoutLoading !== null}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                      isActive
                        ? isDarkMode
                          ? 'bg-white/5 text-slate-600 cursor-default border border-white/[0.07]'
                          : 'bg-slate-100 text-slate-400 cursor-default border border-slate-200'
                        : plan.highlighted
                        ? 'bg-brand text-[#07101f] hover:opacity-90 shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed'
                        : isDarkMode
                        ? 'border border-white/10 text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed'
                        : 'border border-slate-200 text-slate-600 hover:text-brand hover:border-brand/40 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    {checkoutLoading === plan.id ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Redirecting…
                      </>
                    ) : isActive ? (
                      'Active Plan'
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {'Subscribe — $' + plan.monthlyPrice + '/mo'}
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECURITY NOTICE ── */}
      <div className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-[11px] font-semibold ${isDarkMode ? 'bg-white/[0.02] border-white/[0.05] text-slate-500' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
        <svg className="w-4 h-4 shrink-0 mt-0.5 text-brand opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>
          Payments are processed securely by{' '}
          <a
            href="https://stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            Stripe
          </a>
          . DigTrackPro never stores your card details. Cancel or modify your plan at any time through the billing portal.
        </span>
      </div>

      {/* ── SUPER ADMIN: MANUAL ACTIVATION ── */}
      {isSuperAdmin && allCompanies.length > 0 && (
        <div className={`rounded-2xl border p-6 space-y-5 ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2.5">
            <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className={`text-[11px] font-black uppercase tracking-widest ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
              Super Admin — Manual Subscription Override
            </p>
          </div>
          <p className={`text-[11px] ${isDarkMode ? 'text-amber-300/70' : 'text-amber-700/70'}`}>
            Use this to activate a paid plan for customers who pay by check or invoice. This bypasses Stripe.
          </p>

          <form onSubmit={handleAdminOverride} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Company selector */}
            <div className="sm:col-span-2">
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Company
              </label>
              <select
                value={overrideCompanyId}
                onChange={e => setOverrideCompanyId(e.target.value)}
                required
                className={`w-full px-3 py-2.5 rounded-xl text-[11px] font-semibold border appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  isDarkMode
                    ? 'bg-[#0b1629] border-white/[0.08] text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <option value="">Select a company…</option>
                {allCompanies.map(co => (
                  <option key={co.id} value={co.id}>{co.name}</option>
                ))}
              </select>
            </div>

            {/* Plan */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Plan
              </label>
              <select
                value={overridePlan}
                onChange={e => setOverridePlan(e.target.value as PlanName)}
                className={`w-full px-3 py-2.5 rounded-xl text-[11px] font-semibold border appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  isDarkMode
                    ? 'bg-[#0b1629] border-white/[0.08] text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Status
              </label>
              <select
                value={overrideStatus}
                onChange={e => setOverrideStatus(e.target.value as SubscriptionStatus)}
                className={`w-full px-3 py-2.5 rounded-xl text-[11px] font-semibold border appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  isDarkMode
                    ? 'bg-[#0b1629] border-white/[0.08] text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <option value="active">Active (Paid)</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Period End Date */}
            <div className="sm:col-span-2">
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Subscription End Date <span className={`normal-case font-semibold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>(optional — leave blank for open-ended)</span>
              </label>
              <input
                type="date"
                value={overridePeriodEnd}
                onChange={e => setOverridePeriodEnd(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl text-[11px] font-semibold border focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  isDarkMode
                    ? 'bg-[#0b1629] border-white/[0.08] text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </div>

            {/* Submit */}
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={!overrideCompanyId || overrideLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/20"
              >
                {overrideLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    Apply Override
                  </>
                )}
              </button>
              {overrideSuccess && (
                <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                  ✓ Subscription updated
                </span>
              )}
            </div>
          </form>

          {overrideError && (
            <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-400">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {overrideError}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default BillingView;
