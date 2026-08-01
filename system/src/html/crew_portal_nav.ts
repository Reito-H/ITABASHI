// 乗務員ポータル配下（個人データ参照・乗務員シフト・売上分析・担当車表）共通のサブタブ
import { ADMIN_PATH } from '../config';

export type CrewPortalTab = 'portal' | 'crew-shift' | 'sales-analytics' | 'tantosha';

export function crewPortalSubNav(active: CrewPortalTab): string {
  const tabs: Array<{ id: CrewPortalTab; href: string; label: string }> = [
    { id: 'portal',           href: `${ADMIN_PATH}/crew-portal`,    label: '個人データ参照' },
    { id: 'crew-shift',       href: `${ADMIN_PATH}/crew-shift`,     label: '乗務員シフト' },
    { id: 'sales-analytics',  href: `${ADMIN_PATH}/sales-analytics`, label: '売上分析（全社）' },
    { id: 'tantosha',         href: `${ADMIN_PATH}/tantosha`,       label: '担当車表' },
  ];
  return `<div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid #e5e7eb;flex-wrap:wrap;">
    ${tabs.map(t => `<a href="${t.href}" style="padding:9px 16px;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:-2px;border-bottom:2px solid ${active === t.id ? '#1a3a5c' : 'transparent'};color:${active === t.id ? '#1a3a5c' : '#9ca3af'};">${t.label}</a>`).join('')}
  </div>`;
}
