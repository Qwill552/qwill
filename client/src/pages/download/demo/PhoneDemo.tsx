import { useSyncExternalStore } from 'react';

import { DemoSurface } from './DemoSurface';
import type { DemoStore } from './engine/store';
import { PhoneReplica } from './replica/phone/PhoneReplica';

interface PhoneDemoProps {
  store: DemoStore;
  scenarioScrimLit: boolean;
  onScenarioScrimTransitionEnd: () => void;
}

export function PhoneDemo({ store, scenarioScrimLit, onScenarioScrimTransitionEnd }: PhoneDemoProps) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);

  return (
    <DemoSurface store={store}>
      <PhoneReplica
        state={state}
        chatsSurface={store.surfaceOf('chatsScroll', 'top')}
        feedSurface={store.surfaceOf('feedScroll', 'bottom')}
        profileSurface={store.surfaceOf('profileScroll', 'top')}
        settingsSurface={store.surfaceOf('settingsScroll', 'top')}
        typingReadout={store.readoutOf('typing')}
        voiceReadout={store.readoutOf('voice')}
        callSecondsReadout={store.readoutOf('callSeconds')}
        scenarioScrimLit={scenarioScrimLit}
        onScenarioScrimTransitionEnd={onScenarioScrimTransitionEnd}
      />
    </DemoSurface>
  );
}
