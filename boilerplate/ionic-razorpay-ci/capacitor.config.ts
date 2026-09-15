import type { CapacitorConfig } from '@capacitor/cli';

// Boilerplate Capacitor config — replace appId with your reverse-DNS bundle id
// before publishing. webDir must match Vite's build output.
const config: CapacitorConfig = {
  appId: 'com.example.ionicrazorpay',
  appName: 'Ionic Razorpay Demo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;