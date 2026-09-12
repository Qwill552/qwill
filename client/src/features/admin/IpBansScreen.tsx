import {
  IP_BAN_DEFAULT_DAYS,
  IP_BAN_DURATION_DAYS,
  normalizeIpCidr,
  type IpBanDto,
  type IpBanDurationDays,
} from '@messenger/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createIpBanRequest, liftIpBanRequest, listIpBansRequest } from '../../api/admin';
import { AmbientBlobs } from '../../app/AmbientBlobs';
import card from '../../app/desktopCard.module.css';
import { useLayoutMode } from '../../app/useLayoutMode';
import { Card } from '../../ui/Card';
import { ChromeBar } from '../../ui/chrome/ChromeBar';
import { GlassButton } from '../../ui/chrome/GlassButton';
import { GlassPill } from '../../ui/chrome/GlassPill';
import { ScrollIndicator } from '../../ui/ScrollIndicator';
import { Switch } from '../../ui/Switch';
import { DetailModal, type DetailField } from './DetailModal';
import {
  banAuthorText,
  banLifterText,
  banStateText,
  banUntilText,
  durationLabel,
  formatDateTime,
} from './ipBanFormat';
import styles from './IpBansScreen.module.css';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

function banSummary(ban: IpBanDto): string {
  if (ban.liftedAt) return `Снята ${formatDateTime(ban.liftedAt)} · ${banLifterText(ban)} · ${ban.reason}`;
  return `${banUntilText(ban)} · ${banAuthorText(ban)} · ${ban.reason}`;
}

function banFields(ban: IpBanDto): DetailField[] {
  const fields: DetailField[] = [
    { label: 'Диапазон', value: ban.cidr },
    { label: 'Состояние', value: banStateText(ban) },
    { label: 'Заблокирован', value: formatDateTime(ban.createdAt) },
    { label: 'Кем', value: banAuthorText(ban) },
    { label: 'До', value: ban.expiresAt ? formatDateTime(ban.expiresAt) : 'бессрочно' },
  ];
  if (ban.liftedAt) {
    fields.push({ label: 'Снята', value: formatDateTime(ban.liftedAt) });
    fields.push({ label: 'Снял', value: banLifterText(ban) });
  }
  fields.push({ label: 'Причина', value: ban.reason, block: true });
  fields.push({ label: 'Запись', value: ban.id, block: true });
  return fields;
}

export function IpBansScreen() {
  const navigate = useNavigate();
  const isDesktop = useLayoutMode() === 'desktop';
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [bans, setBans] = useState<IpBanDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<IpBanDto | null>(null);

  const [address, setAddress] = useState('');
  const [subnet, setSubnet] = useState(false);
  const [days, setDays] = useState<IpBanDurationDays>(IP_BAN_DEFAULT_DAYS);
  const [reason, setReason] = useState('');

  const preview = normalizeIpCidr(address, subnet);

  const load = useCallback(() => {
    listIpBansRequest()
      .then(setBans)
      .catch((err: unknown) => setError(errorText(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreate(): void {
    if (busy || !address.trim() || !reason.trim()) return;

    setBusy(true);
    setError(null);
    createIpBanRequest({ ip: address.trim(), subnet, reason: reason.trim(), days })
      .then(() => {
        setAddress('');
        setReason('');
        setSubnet(false);
        setDays(IP_BAN_DEFAULT_DAYS);
        load();
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  }

  function handleLift(id: string): void {
    if (busy) return;
    setBusy(true);
    setError(null);
    liftIpBanRequest(id)
      .then((lifted) => {
        setDetail((current) => (current && current.id === lifted.id ? lifted : current));
        load();
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false));
  }

  return (
    <div className={styles.screen}>
      {!isDesktop && <AmbientBlobs />}
      <div
        ref={scrollerRef}
        className={`${styles.scroller} ${isDesktop ? card.root : ''} hide-native-scrollbar`}
      >
        <ScrollIndicator target={scrollerRef} />

        <Card caption="Заблокировать адрес">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ip-ban-address">
              Адрес
            </label>
            <input
              id="ip-ban-address"
              className={styles.input}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="203.0.113.47"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <Card.Row
            title="Вся подсеть"
            subtitle={
              address.trim()
                ? preview
                  ? `Будет заблокировано: ${preview}`
                  : 'Это не похоже на IP-адрес'
                : 'IPv4 расширится до /24, IPv6 — до /64'
            }
            trailing={<Switch checked={subnet} onChange={setSubnet} label="Вся подсеть" disabled={busy} />}
          />

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ip-ban-days">
              Срок
            </label>
            <select
              id="ip-ban-days"
              className={styles.input}
              value={days === null ? 'forever' : String(days)}
              onChange={(event) =>
                setDays(event.target.value === 'forever' ? null : (Number(event.target.value) as IpBanDurationDays))
              }
            >
              {IP_BAN_DURATION_DAYS.map((value) => (
                <option key={value === null ? 'forever' : value} value={value === null ? 'forever' : String(value)}>
                  {durationLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ip-ban-reason">
              Причина
            </label>
            <input
              id="ip-ban-reason"
              className={styles.input}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Для чего закрывается доступ"
            />
          </div>

          <button
            type="button"
            className={styles.submit}
            onClick={handleCreate}
            disabled={busy || !preview || !reason.trim()}
          >
            Заблокировать
          </button>
        </Card>

        <Card caption={`Блокировки (${bans.length})`}>
          {bans.length === 0 ? (
            <Card.Row title="Пусто" subtitle="Ни один адрес не блокировался" />
          ) : (
            bans.map((ban) => (
              <div key={ban.id} className={`${styles.banRow} ${ban.active ? '' : styles.lifted}`}>
                <button
                  type="button"
                  className={styles.banInfo}
                  onClick={() => setDetail(ban)}
                  aria-label={`Подробности блокировки ${ban.cidr}`}
                >
                  <span className={styles.banCidr}>{ban.cidr}</span>
                  <span className={styles.banMeta}>{banSummary(ban)}</span>
                </button>
                {ban.active && (
                  <button
                    type="button"
                    className={styles.lift}
                    onClick={() => handleLift(ban.id)}
                    disabled={busy}
                  >
                    Снять
                  </button>
                )}
              </div>
            ))
          )}
        </Card>

        {error && (
          <Card>
            <Card.Row title="Ошибка" subtitle={error} danger />
          </Card>
        )}
      </div>

      {detail && (
        <DetailModal
          title={detail.cidr}
          fields={banFields(detail)}
          footer={
            detail.active ? (
              <button
                type="button"
                className={styles.lift}
                onClick={() => handleLift(detail.id)}
                disabled={busy}
              >
                Снять блокировку
              </button>
            ) : undefined
          }
          onClose={() => setDetail(null)}
        />
      )}

      {!isDesktop && (
        <ChromeBar>
          <GlassButton icon="back" label="Назад в админ-панель" onClick={() => navigate('/admin')} />
          <GlassPill title="Блокировки IP" />
        </ChromeBar>
      )}
    </div>
  );
}
