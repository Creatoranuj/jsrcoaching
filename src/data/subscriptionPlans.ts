// Frontend metadata for subscription plans. Numeric pricing is the source of
// truth in the `subscription_plans` Supabase table; this file only holds
// presentation copy (features, badges, etc.) so design changes don't need a
// migration.

export type SubscriptionPlanSlug = 'weekly' | 'monthly' | 'yearly';

export interface SubscriptionPlanCopy {
  slug: SubscriptionPlanSlug;
  name: string;
  tagline: string;
  badge?: string;
  features: string[];
  highlight?: boolean;
}

export const SUBSCRIPTION_PLAN_COPY: Record<SubscriptionPlanSlug, SubscriptionPlanCopy> = {
  weekly: {
    slug: 'weekly',
    name: 'Weekly',
    tagline: 'Try premium for a week',
    features: [
      'All premium courses',
      'Live classes',
      'Doubt support',
      'Cancel anytime',
    ],
  },
  monthly: {
    slug: 'monthly',
    name: 'Monthly',
    tagline: 'Most popular',
    badge: 'POPULAR',
    highlight: true,
    features: [
      'All premium courses',
      'Live classes & recordings',
      'Priority doubt support',
      'Downloadable materials',
      'Cancel anytime',
    ],
  },
  yearly: {
    slug: 'yearly',
    name: 'Yearly',
    tagline: 'Best value — save 58%',
    badge: 'BEST VALUE',
    features: [
      'Everything in Monthly',
      'Lock in lowest price',
      '12 months full access',
      'Early access to new courses',
      'Priority chat support',
    ],
  },
};

export const formatPaise = (paise: number): string => {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
