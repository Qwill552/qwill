import { useEffect, useState } from 'react';

import { useBackHandler } from '../../app/useBackHandler';
import { useCallStore } from '../../stores/callStore';
import { CallBanner } from './CallBanner';
import { CallPip } from './CallPip';
import { CallScreen } from './CallScreen';
import { IncomingCall } from './IncomingCall';
import { OutgoingCall } from './OutgoingCall';

export function CallOverlay() {
  const phase = useCallStore((s) => s.phase);
  const callId = useCallStore((s) => s.call?.id ?? null);
  const startedAt = useCallStore((s) => s.startedAt);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [callId]);

  const isCollapsible = phase === 'active';
  useBackHandler(isCollapsible && !collapsed, () => setCollapsed(true));

  if (phase === 'idle') return null;
  if (phase === 'incoming') return <IncomingCall />;
  if (phase === 'outgoing' || (phase === 'ended' && startedAt === null)) return <OutgoingCall />;
  if (isCollapsible && collapsed) {
    return (
      <>
        <CallBanner onExpand={() => setCollapsed(false)} />
        <CallPip onExpand={() => setCollapsed(false)} />
      </>
    );
  }
  return <CallScreen onCollapse={isCollapsible ? () => setCollapsed(true) : undefined} />;
}
