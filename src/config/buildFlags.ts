// Build flags used to gate features per distribution channel.
//
// IS_PLAY_BUILD: When set to "1" at build time, the Razorpay-powered
// subscription paywall is hidden on Android because Google Play requires
// digital subscriptions to use Play Billing. For sideloaded APKs (direct
// install via website) and for web, this stays "0" and Razorpay is shown.
//
// Set in your .env or CI: VITE_IS_PLAY_BUILD=1

export const IS_PLAY_BUILD: boolean =
  import.meta.env.VITE_IS_PLAY_BUILD === '1';
