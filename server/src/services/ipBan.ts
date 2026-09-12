import { BlockList, isIPv4, isIPv6 } from 'node:net';

import {
  ErrorCode,
  IP_BAN_INVALID_MESSAGE,
  IP_BAN_SELF_MESSAGE,
  normalizeIpBanTarget,
  normalizeIpCidr,
  parseCidr,
  type CreateIpBanInput,
  type IpBanDto,
} from '@messenger/shared';

import { prisma } from '../db/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { recordAdminAction, type AdminActor } from './adminLog.js';
import type { IpBan } from '../generated/prisma/client.js';

interface IpBanRule {
  cidr: string;
  expiresAt: Date | null;
}

let rules: IpBanRule[] = [];
let blockList = new BlockList();
let nextExpiryMs = Number.POSITIVE_INFINITY;
let lastLoadMs = 0;
let refreshing = false;

const CONSOLE_REFRESH_MS = 15_000;

function ipVersion(ip: string): 'ipv4' | 'ipv6' | null {
  if (isIPv4(ip)) return 'ipv4';
  if (isIPv6(ip)) return 'ipv6';
  return null;
}

function addRule(list: BlockList, cidr: string): void {
  const parsed = parseCidr(cidr);
  if (!parsed) return;

  const type = parsed.version === 4 ? 'ipv4' : 'ipv6';
  const hostPrefix = parsed.version === 4 ? 32 : 128;
  if (parsed.prefix === hostPrefix) list.addAddress(parsed.address, type);
  else list.addSubnet(parsed.address, parsed.prefix, type);
}

function rebuild(now: number): void {
  const live = rules.filter((rule) => rule.expiresAt === null || rule.expiresAt.getTime() > now);
  const next = new BlockList();
  let soonest = Number.POSITIVE_INFINITY;

  for (const rule of live) {
    addRule(next, rule.cidr);
    if (rule.expiresAt) soonest = Math.min(soonest, rule.expiresAt.getTime());
  }

  rules = live;
  blockList = next;
  nextExpiryMs = soonest;
}

function isActive(ban: IpBan, now: Date): boolean {
  if (ban.liftedAt) return false;
  return ban.expiresAt === null || ban.expiresAt.getTime() > now.getTime();
}

export async function loadIpBans(): Promise<void> {
  const bans = await prisma.ipBan.findMany({ where: { liftedAt: null } });
  rules = bans.map((ban) => ({ cidr: ban.cidr, expiresAt: ban.expiresAt }));
  lastLoadMs = Date.now();
  rebuild(lastLoadMs);
}

function scheduleConsoleRefresh(now: number): void {
  if (refreshing || now - lastLoadMs < CONSOLE_REFRESH_MS) return;
  refreshing = true;
  void loadIpBans().finally(() => {
    refreshing = false;
  });
}

export function isIpBanned(ip: string): boolean {
  if (rules.length === 0) return false;

  const now = Date.now();
  if (now >= nextExpiryMs) rebuild(now);
  if (rules.length === 0) return false;

  const version = ipVersion(ip);
  if (!version) return false;

  const blocked = blockList.check(ip, version);
  if (blocked) scheduleConsoleRefresh(now);
  return blocked;
}

function cidrCoversIp(cidr: string, ip: string): boolean {
  const version = ipVersion(ip);
  if (!version) return false;

  const probe = new BlockList();
  addRule(probe, cidr);
  return probe.check(ip, version);
}

function toIpBanDto(ban: IpBan, now: Date): IpBanDto {
  return {
    id: ban.id,
    cidr: ban.cidr,
    reason: ban.reason,
    expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
    createdAt: ban.createdAt.toISOString(),
    createdByUsername: ban.createdByUsername,
    liftedAt: ban.liftedAt ? ban.liftedAt.toISOString() : null,
    liftedByUsername: ban.liftedByUsername,
    active: isActive(ban, now),
  };
}

export async function listIpBans(): Promise<IpBanDto[]> {
  const now = new Date();
  const bans = await prisma.ipBan.findMany({ orderBy: { createdAt: 'desc' } });
  return bans.map((ban) => toIpBanDto(ban, now));
}

async function adminUsername(adminId: string): Promise<string | null> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  return admin?.username ?? null;
}

export async function createIpBan(actor: AdminActor, input: CreateIpBanInput): Promise<IpBanDto> {
  const cidr = normalizeIpCidr(input.ip, input.subnet);
  if (!cidr) throw badRequest(ErrorCode.VALIDATION_FAILED, IP_BAN_INVALID_MESSAGE);
  if (cidrCoversIp(cidr, actor.ip)) throw badRequest(ErrorCode.FORBIDDEN, IP_BAN_SELF_MESSAGE);

  const expiresAt = input.days === null ? null : new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
  const username = await adminUsername(actor.adminId);

  const ban = await prisma.ipBan.upsert({
    where: { cidr },
    create: {
      cidr,
      reason: input.reason,
      expiresAt,
      createdById: actor.adminId,
      createdByUsername: username,
    },
    update: {
      reason: input.reason,
      expiresAt,
      createdById: actor.adminId,
      createdByUsername: username,
      liftedAt: null,
      liftedById: null,
      liftedByUsername: null,
    },
  });

  await loadIpBans();
  await recordAdminAction(actor, { action: 'ip.ban', detail: { cidr, days: input.days } });
  return toIpBanDto(ban, new Date());
}

export async function liftIpBan(actor: AdminActor, id: string): Promise<IpBanDto> {
  const existing = await prisma.ipBan.findUnique({ where: { id } });
  if (!existing) throw notFound(ErrorCode.NOT_FOUND, 'Блокировка не найдена');

  const ban = await prisma.ipBan.update({
    where: { id },
    data: {
      liftedAt: new Date(),
      liftedById: actor.adminId,
      liftedByUsername: await adminUsername(actor.adminId),
    },
  });

  await loadIpBans();
  await recordAdminAction(actor, { action: 'ip.unban', detail: { cidr: ban.cidr } });
  return toIpBanDto(ban, new Date());
}

export async function liftIpBanFromConsole(target: string): Promise<IpBanDto | null> {
  const cidr = normalizeIpBanTarget(target);
  const existing = await prisma.ipBan.findFirst({
    where: { OR: [{ id: target }, ...(cidr ? [{ cidr }] : [])], liftedAt: null },
  });
  if (!existing) return null;

  const ban = await prisma.ipBan.update({
    where: { id: existing.id },
    data: { liftedAt: new Date(), liftedById: null, liftedByUsername: 'console' },
  });

  await recordAdminAction(
    { adminId: 'console', ip: 'console' },
    { action: 'ip.unban', detail: { cidr: ban.cidr, source: 'console' } },
  );
  return toIpBanDto(ban, new Date());
}

export async function listActiveIpBans(): Promise<IpBanDto[]> {
  const now = new Date();
  const bans = await prisma.ipBan.findMany({ where: { liftedAt: null }, orderBy: { createdAt: 'desc' } });
  return bans.filter((ban) => isActive(ban, now)).map((ban) => toIpBanDto(ban, now));
}
