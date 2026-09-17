import { useEffect, useLayoutEffect } from 'react';

import { AdminReauthGate } from '../features/admin/ReauthDialog';
import { CallOverlay } from '../features/calls/CallOverlay';
import { ScreenSourcePicker } from '../features/calls/ScreenSourcePicker';
import { AvatarViewer } from '../features/media/AvatarViewer';
import { MediaViewer } from '../features/media/MediaViewer';
import { QrInviteModal } from '../features/profile/QrInviteModal';
import { RequiredUpdateModal, UpdateModal } from '../features/updates/UpdateModal';
import { keepDesktopWidth } from '../native/desktop';
import { applyDesktopListWidth, useDesktopColumnsStore } from '../stores/desktopColumnsStore';
import { AmbientBlobs } from './AmbientBlobs';
import { useAppUpdateStore } from './appUpdate';
import { useDesktopBadgeSync } from './desktopBadge';
import { useDesktopDeepLinks } from './desktopDeepLinks';
import { useDesktopUpdateStore } from './desktopUpdate';
import { useNativeDeepLinks } from './nativeDeepLinks';
import { ScreenStack } from './ScreenStack';
import styles from './AppShell.module.css';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';
import { DESKTOP_MIN_WIDTH, useLayoutMode } from './useLayoutMode';

/** Каркас авторизованной части приложения: канвас + контент вкладок + таб-бар. `100dvh` и
 *  safe-area берутся из tokens.css (html/body/#root), здесь только слои [канвас][контент]
 *  [таб-бар] — этап 0, буквальный перенос из design-archive/reference. */
export function AppShell() {
  const checkAppUpdate = useAppUpdateStore((s) => s.check);
  const updateModalOpen = useAppUpdateStore((s) => s.modalOpen);
  const closeUpdateModal = useAppUpdateStore((s) => s.closeModal);
  const initDesktopUpdate = useDesktopUpdateStore((s) => s.init);
  const layout = useLayoutMode();
  const listWidth = useDesktopColumnsStore((s) => s.listWidth);

  useLayoutEffect(() => {
    applyDesktopListWidth(listWidth);
  }, [listWidth]);

  useEffect(() => {
    void checkAppUpdate();
  }, [checkAppUpdate]);

  useEffect(() => keepDesktopWidth(DESKTOP_MIN_WIDTH), []);

  useEffect(() => initDesktopUpdate(), [initDesktopUpdate]);

  useDesktopBadgeSync();
  useDesktopDeepLinks();
  useNativeDeepLinks();

  return (
    <div className={`${styles.shell} ${layout === 'desktop' ? styles.desktop : ''}`}>
      {layout === 'mobile' && <AmbientBlobs />}
      <ScreenStack />
      <TabBar />
      <UpdateBanner />
      <CallOverlay />
      <ScreenSourcePicker />
      <MediaViewer />
      <AvatarViewer />
      <QrInviteModal />
      <AdminReauthGate />
      {updateModalOpen && <UpdateModal onClose={closeUpdateModal} />}
      <RequiredUpdateModal />
    </div>
  );
}
