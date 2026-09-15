import { useState } from 'react';
import { Check, Loader2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription, useSubscriptionPlans, type SubscriptionPlanRow } from '@/hooks/useSubscription';
import {
  SUBSCRIPTION_PLAN_COPY,
  formatPaise,
  type SubscriptionPlanSlug,
} from '@/data/subscriptionPlans';
import { openSubscriptionCheckout, startSubscriptionTrial } from '@/utils/openSubscriptionCheckout';
import { IS_PLAY_BUILD } from '@/config/buildFlags';

interface Props {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

export const SubscriptionPaywall = ({ title, subtitle, onSuccess }: Props) => {
  const { user, isAuthenticated } = useAuth();
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();
  const { refetch, subscription } = useSubscription();
  const [busy, setBusy] = useState<SubscriptionPlanSlug | null>(null);

  if (IS_PLAY_BUILD) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold">Premium coming soon</h3>
        <p className="text-sm text-muted-foreground">
          Subscriptions are not available on this build.
        </p>
      </Card>
    );
  }

  const handleSubscribe = async (slug: SubscriptionPlanSlug) => {
    if (!isAuthenticated) {
      toast.error('Please login to subscribe');
      return;
    }
    setBusy(slug);
    await openSubscriptionCheckout(
      slug,
      { name: user?.fullName ?? '', email: user?.email ?? '' },
      {
        onSuccess: () => {
          toast.success('🎉 Welcome to JSR COACHING Premium!');
          refetch();
          setBusy(null);
          onSuccess?.();
        },
        onError: (msg) => {
          toast.error(msg);
          setBusy(null);
        },
        onDismiss: () => {
          toast.info('Payment cancelled.');
          setBusy(null);
        },
      }
    );
  };

  const handleStartTrial = async (slug: SubscriptionPlanSlug) => {
    if (!isAuthenticated) {
      toast.error('Please login to start trial');
      return;
    }
    setBusy(slug);
    const res = await startSubscriptionTrial(slug);
    if (res.ok === true) {
      toast.success('Free trial started — enjoy premium!');
      await refetch();
      onSuccess?.();
    } else {
      toast.error(res.error);
    }
    setBusy(null);
  };

  const canTrial = !subscription; // never had any sub before

  if (plansLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Crown className="h-3.5 w-3.5" />
          Premium Access
        </div>
        <h2 className="mb-2 text-2xl font-bold sm:text-3xl">
          {title ?? 'Poora JSR COACHING — ek subscription me'}
        </h2>
        <p className="text-sm text-muted-foreground sm:text-base">
          {subtitle ?? 'Cancel anytime. 3-day free trial on every plan.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(plans ?? []).map((plan) => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            busy={busy === plan.slug}
            canTrial={canTrial && plan.trial_days > 0}
            onSubscribe={() => handleSubscribe(plan.slug as SubscriptionPlanSlug)}
            onStartTrial={() => handleStartTrial(plan.slug as SubscriptionPlanSlug)}
          />
        ))}
      </div>
    </div>
  );
};

interface PlanCardProps {
  plan: SubscriptionPlanRow;
  busy: boolean;
  canTrial: boolean;
  onSubscribe: () => void;
  onStartTrial: () => void;
}

const PlanCard = ({ plan, busy, canTrial, onSubscribe, onStartTrial }: PlanCardProps) => {
  const copy = SUBSCRIPTION_PLAN_COPY[plan.slug as SubscriptionPlanSlug];
  const periodLabel =
    plan.period_days === 7 ? 'week' : plan.period_days >= 365 ? 'year' : 'month';

  return (
    <Card
      className={
        copy?.highlight
          ? 'relative border-2 border-primary p-5 shadow-lg'
          : 'relative p-5'
      }
    >
      {copy?.badge && (
        <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground">
          {copy.badge}
        </Badge>
      )}

      <h3 className="text-lg font-semibold">{copy?.name ?? plan.name}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{copy?.tagline}</p>

      <div className="mb-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{formatPaise(plan.amount_paise)}</span>
        <span className="text-sm text-muted-foreground">/{periodLabel}</span>
      </div>
      {plan.trial_days > 0 && (
        <p className="mb-4 text-xs text-primary">
          {plan.trial_days}-day free trial
        </p>
      )}

      <ul className="mb-5 space-y-2">
        {(copy?.features ?? []).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        {canTrial && (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={onStartTrial}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start Free Trial'}
          </Button>
        )}
        <Button
          className="w-full"
          disabled={busy}
          onClick={onSubscribe}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe Now'}
        </Button>
      </div>
    </Card>
  );
};

export default SubscriptionPaywall;
