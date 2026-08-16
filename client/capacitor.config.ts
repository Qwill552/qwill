import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qwill.app',
  appName: 'Qwill',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    url: 'https://qwill.mooo.com',
  },
};

export default config;
