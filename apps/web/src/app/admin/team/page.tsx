'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, KeyRound, UserPlus, CheckCircle2 } from 'lucide-react';

export default function AdminTeamPage() {
  const [team] = useState([
    {
      id: 'adm_1',
      name: 'Super Admin',
      email: 'admin@sidprep.in',
      role: 'SUPER_ADMIN',
      is2faEnabled: true,
      status: 'ACTIVE',
      lastLogin: 'Today, 10:45 PM IST',
    },
    {
      id: 'adm_2',
      name: 'Exam & Content Editor',
      email: 'editor@sidprep.in',
      role: 'EXAM_EDITOR',
      is2faEnabled: true,
      status: 'ACTIVE',
      lastLogin: 'Today, 05:30 AM IST',
    },
    {
      id: 'adm_3',
      name: 'Current Affairs Lead',
      email: 'news@sidprep.in',
      role: 'CA_EDITOR',
      is2faEnabled: true,
      status: 'ACTIVE',
      lastLogin: 'Yesterday, 07:15 PM IST',
    },
    {
      id: 'adm_4',
      name: 'Compliance Auditor',
      email: 'auditor@sidprep.in',
      role: 'AUDITOR',
      is2faEnabled: true,
      status: 'ACTIVE',
      lastLogin: '01 Nov 2026, 03:20 PM IST',
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Staff Access & Role-Based Permissions
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Mandatory TOTP 2FA • Granular server-enforced roles • Least privilege principle
          </p>
        </div>

        <button
          onClick={() => alert('New administrator provisioning requires Super Admin approval.')}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
        >
          <UserPlus className="w-4 h-4" /> Provision Staff Member
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Staff Member</th>
              <th className="py-3.5 px-5">Granular Role</th>
              <th className="py-3.5 px-5">Two-Factor Authentication</th>
              <th className="py-3.5 px-5">Status</th>
              <th className="py-3.5 px-5">Last Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {team.map((user) => (
              <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-5">
                  <span className="font-heading font-bold text-white block">{user.name}</span>
                  <span className="text-[11px] font-mono text-slate-400">{user.email}</span>
                </td>
                <td className="py-4 px-5">
                  <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {user.role}
                  </span>
                </td>
                <td className="py-4 px-5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                    <KeyRound className="w-3.5 h-3.5" /> TOTP ACTIVE (RFC 6238)
                  </span>
                </td>
                <td className="py-4 px-5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    {user.status}
                  </span>
                </td>
                <td className="py-4 px-5 text-slate-400 text-[11px]">{user.lastLogin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
