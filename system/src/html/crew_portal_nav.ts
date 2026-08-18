// 乗務員シフト・売上分析（全社）・担当車表の共通サブタブ（社員管理の関連ページ）
import { ADMIN_PATH } from '../config';

export type CrewPortalTab = 'crew-shift' | 'sales-analytics' | 'tantosha' | 'dispatch-board' | 'vehicle-rotation' | 'none';

export function crewPortalSubNav(active: CrewPortalTab): string {
  const tabs: Array<{ id: CrewPortalTab; href: string; label: string }> = [
    { id: 'crew-shift',      href: `${ADMIN_PATH}/crew-shift`,      label: '乗務員シフト' },
    { id: 'dispatch-board',  href: `${ADMIN_PATH}/dispatch-board`,  label: '配車管理' },
    { id: 'vehicle-rotation', href: `${ADMIN_PATH}/vehicle-rotation`, label: '車両ローテーション' },
    { id: 'sales-analytics', href: `${ADMIN_PATH}/sales-analytics`, label: '売上分析（全社）' },
    { id: 'tantosha',        href: `${ADMIN_PATH}/tantosha`,        label: '担当車表' },
  ];
  return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;border-bottom:2px solid #e5e7eb;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/staff" style="padding:9px 2px;text-decoration:none;font-size:12.5px;color:#94a3b8;font-weight:600;white-space:nowrap;">← 社員管理</a>
    <div style="width:1px;align-self:stretch;background:#e5e7eb;margin:8px 0;"></div>
    ${tabs.map(t => `<a href="${t.href}" style="padding:9px 16px;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:-2px;border-bottom:2px solid ${active === t.id ? '#1a3a5c' : 'transparent'};color:${active === t.id ? '#1a3a5c' : '#9ca3af'};">${t.label}</a>`).join('')}
  </div>`;
}
