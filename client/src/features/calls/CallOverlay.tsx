import { useEffect, useRef, useState } from 'react';

import { useBackHandler } from '../../app/useBackHandler';
import { useCallStore } from '../../stores/callStore';
import { CallBanner } from './CallBanner';
import { CallScreen } from './CallScreen';

export function CallOverlay() {
  const phase = useCallStore((s) => s.phase);
  const callId = useCallStore((s) => s.call?.id ?? null);
  const acceptCall = useCallStore((s) => s.acceptCall);

  const [collapsed, setCollapsed] = useState(false);
  const acceptedCallId = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== 'incoming' || !callId || acceptedCallId.current === callId) return;
    acceptedCallId.current = callId;
    void acceptCall();
  }, [phase, callId, acceptCall]);

  useEffect(() => {
    setCollapsed(false);
  }, [callId]);

  const isCollapsible = phase === 'active';
  useBackHandler(isCollapsible && !collapsed, () => setCollapsed(true));

  if (phase === 'idle') return null;
  if (isCollapsible && collapsed) return <CallBanner onExpand={() => setCollapsed(false)} />;
  return <CallScreen onCollapse={isCollapsible ? () => setCollapsed(true) : undefined} />;
}
