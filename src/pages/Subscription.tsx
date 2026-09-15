import { Loader2 } from 'lucide-react';
import { SubscriptionPaywall } from '@/components/SubscriptionPaywall';
import { useSubscription } from '@/hooks/useSubscription';
import { SUBSCRIPTION_PLAN_COPY, formatPaise } from '@/data/subscriptionPlans';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const Subscription = () => {
  const { subscription, isPremium, isTrial, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Checking your subscription…</p>
        </div>
      </div>
    );
  }

  if (isPremium && subscription) {
    const copy = SUBSCRIPTION_PLAN_COPY[subscription.plan_slug];
    const endDate = subscription.current_period_end
      ? new Date(subscription.current_period_end).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
    return (
      <div className="container mx-auto max-w-2xl px-4 pt-10 pb-28 md:pb-10">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Subscription</h1>
            <Badge variant={isTrial ? 'outline' : 'default'}>
              {isTrial ? 'Free Trial' : 'Active'}
            </Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground">Plan</div>
              <div className="text-base font-medium">{copy?.name ?? subscription.plan_slug}</div>
            </div>
            {subscription.amount_paid_paise != null && (
              <div>
                <div className="text-muted-foreground">Last paid</div>
                <div className="text-base font-medium">
                  {formatPaise(subscription.amount_paid_paise)}
                </div>
              </div>
            )}
            <div>
              <div className="text-muted-foreground">
                {isTrial ? 'Trial ends' : 'Renews on'}
              </div>
              <div className="text-base font-medium">{endDate}</div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="container mx-auto max-w-5xl px-4 pt-10 pb-28 md:pb-10">
        <SubscriptionPaywall />
      </div>
    </main>
  );
};

export default Subscription;
