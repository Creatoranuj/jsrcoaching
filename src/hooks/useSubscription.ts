import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { reportError } from '@/lib/sentry';
import type { SubscriptionPlanSlug } from '@/data/subscriptionPlans';

export interface ActiveSubscription {
  id: string;
  plan_slug: SubscriptionPlanSlug;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  trial_ends_at: string | null;
  current_period_end: string | null;
  amount_paid_paise: number | null;
  currency: string | null;
  created_at: string;
}

export interface SubscriptionPlanRow {
  slug: SubscriptionPlanSlug;
  name: string;
  description: string | null;
  amount_paise: number;
  currency: string;
  period_days: number;
  trial_days: number;
  sort_order: number;
}

/** Returns the user's current live (trial or active) subscription, if any. */
export const useSubscription = () => {
  const { user, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['user-subscription', user?.id],
    enabled: isAuthenticated && !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<ActiveSubscription | null> => {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(
          'id, plan_slug, status, trial_ends_at, current_period_end, amount_paid_paise, currency, created_at'
        )
        .eq('user_id', user!.id)
        .in('status', ['trial', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        reportError(error, { surface: 'useSubscription' });
        return null;
      }

      // Client-side expiry check (server is source of truth, but this hides
      // already-stale rows immediately without waiting for a cron sweep).
      if (data?.current_period_end) {
        const end = new Date(data.current_period_end).getTime();
        if (end < Date.now()) return null;
      }

      return (data as ActiveSubscription | null) ?? null;
    },
  });

  const sub = query.data ?? null;
  const isPremium = !!sub && (sub.status === 'trial' || sub.status === 'active');

  return {
    subscription: sub,
    isPremium,
    isTrial: sub?.status === 'trial',
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};

/** Reads the public catalog of subscription plans. */
export const useSubscriptionPlans = () => {
  return useQuery({
    queryKey: ['subscription-plans'],
    staleTime: 60 * 60_000, // 1h — plan catalog only changes via admin action
    gcTime: 24 * 60 * 60_000,
    queryFn: async (): Promise<SubscriptionPlanRow[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('slug, name, description, amount_paise, currency, period_days, trial_days, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubscriptionPlanRow[];
    },
  });
};
