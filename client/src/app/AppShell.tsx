import { useEffect } from 'react';

import { CallOverlay } from '../features/calls/CallOverlay';
import { RequiredUpdateModal, UpdateModal } from '../features/updates/UpdateModal';
import { AmbientBlobs } from './AmbientBlobs';
import { useAppUpdateStore } from './appUpdate';
import { ScreenStack } from './ScreenStack';
import styles from './AppShell.module.css';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';

/** Каркас авторизованной части приложения: канвас + контент вкладок + таб-бар. `100dvh` и
 *  safe-area берутся из tokens.css (html/body/#root), здесь только слои [канвас][контент]
 *  [таб-бар] — этап 0, буквальный перенос из design-archive/reference. */
export function AppShell() {
  const checkAppUpdate = useAppUpdateStore((s) => s.check);
  const updateModalOpen = useAppUpdateStore((s) => s.modalOpen);
  const closeUpdateModal = useAppUpdateStore((s) => s.closeModal);

  useEffect(() => {
    void checkAppUpdate();
  }, [checkAppUpdate]);

  return (
    <div className={styles.shell}>
      <AmbientBlobs />
      <ScreenStack />
      <TabBar />
      <UpdateBanner />
      <CallOverlay />
      {updateModalOpen && <UpdateModal onClose={closeUpdateModal} />}
      <RequiredUpdateModal />
    </div>
  );
}
