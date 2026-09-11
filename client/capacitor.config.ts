import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qwill.app',
  appName: 'Qwill',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
  server: {
    androidScheme: 'https',
    url: 'https://qwill.mooo.com',
  },
};

export default config;
