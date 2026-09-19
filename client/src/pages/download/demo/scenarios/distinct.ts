import type { Scenario } from '../engine/timeline';

const CHATS_PEEK = 200;

const PROFILE_SCROLL_MAX = 1000;

const SETTINGS_SCROLL_MAX = 600;

const CALL_CONNECTED_SECONDS = 2;

export const DISTINCT_SCENARIO: Scenario = {
  id: 'distinct',
  scenes: [
    { durationMs: 2000, ease: 'inOut', set: { screen: 'chats', chatsScroll: CHATS_PEEK } },
    { durationMs: 3000, ease: 'inOut', set: { screen: 'profile', profileScroll: PROFILE_SCROLL_MAX } },
    { durationMs: 2000, ease: 'linear' },
    { durationMs: 1400, ease: 'linear', set: { screen: 'wallpaper', wallpaperIndex: 0 } },
    { durationMs: 1300, ease: 'linear', set: { wallpaperIndex: 1 } },
    { durationMs: 1300, ease: 'linear', set: { wallpaperIndex: 2 } },
    { durationMs: 1600, ease: 'linear', set: { screen: 'call', callConnected: false, callSeconds: 0 } },
    {
      durationMs: 2400,
      ease: 'linear',
      set: { callConnected: true, callSeconds: CALL_CONNECTED_SECONDS },
    },
    { durationMs: 3000, ease: 'linear', set: { screen: 'qr' } },
    { durationMs: 700, ease: 'linear', set: { screen: 'settings', settingsScroll: 0 } },
    {
      durationMs: 1300,
      ease: 'inOut',
      set: { settingsScroll: SETTINGS_SCROLL_MAX, chatsScroll: 0 },
    },
  ],
};
