import { Capacitor } from '@capacitor/core';
import type { LegalDocId, LegalDocumentDto } from '@messenger/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { getCurrentLegalVersionsRequest, getLegalDocumentRequest } from '../api/legal';
import { IconButton } from '../ui/IconButton';
import { renderLegalDocumentMarkdown } from '../utils/markdown';
import styles from './LegalScreen.module.css';

export function LegalScreen() {
  const { doc, version } = useParams<{ doc: LegalDocId; version?: string }>();
  const navigate = useNavigate();
  const showBack = Capacitor.isNativePlatform();
  const [legalDoc, setLegalDoc] = useState<LegalDocumentDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    setLegalDoc(null);
    setError(null);

    const load = async () => {
      const resolvedVersion = version ?? (await getCurrentLegalVersionsRequest())[doc === 'terms' ? 'termsVersion' : 'privacyVersion'];
      return getLegalDocumentRequest(doc, resolvedVersion);
    };

    load()
      .then(setLegalDoc)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось загрузить документ'));
  }, [doc, version]);

  return (
    <div className={`${styles.screen} ${showBack ? styles.screenWithBack : ''}`}>
      {showBack && (
        <IconButton
          icon="back"
          label="Назад"
          className={styles.back}
          onClick={() => navigate(-1)}
        />
      )}
      <main className={styles.body}>
        {error && <p className={styles.error}>{error}</p>}
        {!error && !legalDoc && <p className={styles.loading}>Загрузка…</p>}
        {legalDoc && (
          <div
            className={styles.content}
            dangerouslySetInnerHTML={{ __html: renderLegalDocumentMarkdown(legalDoc.content) }}
          />
        )}
      </main>
    </div>
  );
}
