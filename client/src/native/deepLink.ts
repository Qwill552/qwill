import { Capacitor, registerPlugin } from '@capacitor/core';

interface DeepLinkPlugin {
  addListener(
    eventName: 'deepLink',
    listener: (event: { path: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export function isNativeDeepLinkAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('QwillDeepLink');
}

export function subscribeToNativeDeepLinks(handler: (path: string) => void): () => void {
  if (!isNativeDeepLinkAvailable()) return () => undefined;

  const plugin = registerPlugin<DeepLinkPlugin>('QwillDeepLink');
  const pending = plugin.addListener('deepLink', (event) => {
    if (typeof event.path === 'string' && event.path.startsWith('/')) handler(event.path);
  });

  return () => {
    void pending.then((handle) => handle.remove());
  };
}
