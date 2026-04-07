// Supabase Edge Function: stripe-webhook
// Receives Stripe webhook events and updates the company_subscriptions table
// Deploy: supabase functions deploy stripe-webhook
// Configure in Stripe Dashboard: https://dashboard.stripe.com/webhooks
//   Endpoint URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events to listen for:
//     - checkout.session.completed
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_failed

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env vars');
    return new Response('Webhook configuration error', { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify Stripe signature
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[stripe-webhook] Signature verification failed:', message);
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  console.log(`[stripe-webhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const companyId = session.metadata?.company_id;
        if (!companyId) {
          console.warn('[stripe-webhook] checkout.session.completed: missing company_id in metadata');
          break;
        }

        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        // Fetch full subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;
        const planName = resolvePlanName(priceId);

        await upsertSubscription(supabase, {
          companyId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          planName,
          status: mapStripeStatus(subscription.status),
          currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;
        if (!companyId) {
          console.warn('[stripe-webhook] subscription.updated: missing company_id in metadata');
          break;
        }

        const priceId = subscription.items.data[0]?.price.id;
        const planName = resolvePlanName(priceId);

        await upsertSubscription(supabase, {
          companyId,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          planName,
          status: mapStripeStatus(subscription.status),
          currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;
        if (!companyId) {
          console.warn('[stripe-webhook] subscription.deleted: missing company_id in metadata');
          break;
        }

        await upsertSubscription(supabase, {
          companyId,
          stripeCustomerId: subscription.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0]?.price.id,
          planName: 'free',
          status: 'canceled',
          currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: false,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const companyId = subscription.metadata?.company_id;
        if (!companyId) break;

        const { error } = await supabase
          .from('company_subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('company_id', companyId);

        if (error) console.error('[stripe-webhook] Failed to update past_due status:', error);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing error';
    console.error(`[stripe-webhook] Error processing ${event.type}:`, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Map Stripe subscription status to our internal SubscriptionStatus type
function mapStripeStatus(status: string): string {
  const map: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'past_due',
    incomplete: 'inactive',
    incomplete_expired: 'canceled',
    paused: 'inactive',
  };
  return map[status] ?? 'inactive';
}

// Derive a human-readable plan name from a Stripe price ID
// Update these IDs to match your actual Stripe price IDs
function resolvePlanName(priceId: string | undefined): string {
  const enterprisePriceId = Deno.env.get('STRIPE_ENTERPRISE_PRICE_ID');
  const proPriceId = Deno.env.get('STRIPE_PRO_PRICE_ID');

  if (priceId && enterprisePriceId && priceId === enterprisePriceId) return 'enterprise';
  if (priceId && proPriceId && priceId === proPriceId) return 'pro';
  return 'pro'; // default paid plan
}

interface SubscriptionUpsertData {
  companyId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  planName: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  data: SubscriptionUpsertData,
) {
  const { error } = await supabase
    .from('company_subscriptions')
    .upsert(
      {
        company_id: data.companyId,
        stripe_customer_id: data.stripeCustomerId,
        stripe_subscription_id: data.stripeSubscriptionId,
        stripe_price_id: data.stripePriceId,
        plan_name: data.planName,
        status: data.status,
        current_period_start: data.currentPeriodStart,
        current_period_end: data.currentPeriodEnd,
        cancel_at_period_end: data.cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );

  if (error) {
    console.error('[stripe-webhook] upsertSubscription error:', error);
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
  console.log(`[stripe-webhook] Subscription upserted for company ${data.companyId}: ${data.status}`);
}
