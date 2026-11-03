'use client';

import { useState } from 'react';
import { ScrollText, Shield, Activity, Smartphone, Eye, X, Filter } from 'lucide-react';

export default function AdminLogsPage() {
  const [activeLayer, setActiveLayer] = useState<'AUDIT' | 'OPERATIONAL' | 'TELEMETRY'>('AUDIT');
  const [timezone, setTimezone] = useState<'IST' | 'UTC'>('IST');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const auditLogs = [
    {
      id: 'aud_101',
      actor: 'admin@sidprep.in',
      role: 'SUPER_ADMIN',
      module: 'EXAM_PATTERN',
      action: 'APPROVE',
      target: 'ssc-cgl',
      ip: '127.0.0.1',
      timestampIST: '03 Nov 2026, 10:45 PM IST',
      timestampUTC: '03 Nov 2026, 17:15 UTC',
      diff: { scheme: 'SSC CGL 2026 Tier-1 Verified against official gazette notice' },
    },
    {
      id: 'aud_102',
      actor: 'editor@sidprep.in',
      role: 'EXAM_EDITOR',
      module: 'CURRENT_AFFAIRS',
      action: 'PUBLISH_ARTICLE',
      target: 'ca_01',
      ip: '127.0.0.1',
      timestampIST: '03 Nov 2026, 07:00 AM IST',
      timestampUTC: '03 Nov 2026, 01:30 UTC',
      diff: { title: 'PM-Surya Ghar Scheme Adopted', editorialStatus: 'PUBLISHED' },
    },
    {
      id: 'aud_103',
      actor: 'admin@sidprep.in',
      role: 'SUPER_ADMIN',
      module: 'RESOURCES',
      action: 'UPDATE_PERMISSIONS',
      target: 'res_rrb_science_notes',
      ip: '127.0.0.1',
      timestampIST: '02 Nov 2026, 04:20 PM IST',
      timestampUTC: '02 Nov 2026, 10:50 UTC',
      diff: { previewAllowed: true, downloadAllowed: false },
    },
  ];

  const operationalLogs = [
    {
      id: 'ops_201',
      service: 'WORKER_CRON',
      level: 'INFO',
      message: 'Executed scheduled 05:30 IST RSS news ingestion cycle',
      meta: { itemsFound: 2, itemsDrafted: 2 },
      timestampIST: '03 Nov 2026, 05:30 AM IST',
    },
    {
      id: 'ops_202',
      service: 'BREVO',
      level: 'INFO',
      message: 'Dispatched student OTP email (Daily count: 14/300)',
      meta: { service: 'transactional_otp' },
      timestampIST: '03 Nov 2026, 09:12 PM IST',
    },
  ];

  const telemetryLogs = [
    {
      id: 'tel_301',
      appVersion: '2.0.0',
      os: 'android',
      eventCode: 'OFFLINE_SYNC_SUCCESS',
      correlationId: 'req_sync_88912',
      metadata: { syncedCount: 4, attemptId: 'att_cgl_01' },
      timestampIST: '03 Nov 2026, 09:30 PM IST',
    },
    {
      id: 'tel_302',
      appVersion: '2.0.0',
      os: 'android',
      eventCode: 'RENDER_QUESTION_LATEX',
      correlationId: 'req_view_11234',
      metadata: { questionId: 'q_2', durationMs: 14 },
      timestampIST: '03 Nov 2026, 09:35 PM IST',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            3-Layer Central Log Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable Audit Trail • Operational & Background Logs • Sanitized Student Telemetry
          </p>
        </div>

        {/* Timezone Toggle */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setTimezone('IST')}
            className={`px-3 py-1.5 rounded-lg ${timezone === 'IST' ? 'bg-primary text-white' : 'text-slate-400'}`}
          >
            Asia/Kolkata (IST)
          </button>
          <button
            onClick={() => setTimezone('UTC')}
            className={`px-3 py-1.5 rounded-lg ${timezone === 'UTC' ? 'bg-primary text-white' : 'text-slate-400'}`}
          >
            UTC
          </button>
        </div>
      </div>

      {/* Layer Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveLayer('AUDIT')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'AUDIT'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4" /> Layer 1: Immutable Audit Trail
        </button>

        <button
          onClick={() => setActiveLayer('OPERATIONAL')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'OPERATIONAL'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" /> Layer 2: Operational & Jobs
        </button>

        <button
          onClick={() => setActiveLayer('TELEMETRY')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeLayer === 'TELEMETRY'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Smartphone className="w-4 h-4" /> Layer 3: Student Telemetry
        </button>
      </div>

      {/* Tables based on active layer */}
      {activeLayer === 'AUDIT' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-5">Timestamp</th>
                <th className="py-3.5 px-5">Actor & Role</th>
                <th className="py-3.5 px-5">Module</th>
                <th className="py-3.5 px-5">Action</th>
                <th className="py-3.5 px-5">Target ID</th>
                <th className="py-3.5 px-5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5 font-mono text-[11px] text-slate-400">
                    {timezone === 'IST' ? log.timestampIST : log.timestampUTC}
                  </td>
                  <td className="py-4 px-5">
                    <span className="font-semibold text-white block">{log.actor}</span>
                    <span className="text-[10px] text-primary font-bold">{log.role}</span>
                  </td>
                  <td className="py-4 px-5 font-mono text-slate-300">{log.module}</td>
                  <td className="py-4 px-5 font-bold text-slate-200">{log.action}</td>
                  <td className="py-4 px-5 font-mono text-slate-400">{log.target}</td>
                  <td className="py-4 px-5">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-primary hover:text-white"
                      title="Inspect Diff"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeLayer === 'OPERATIONAL' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-5">Timestamp (IST)</th>
                <th className="py-3.5 px-5">Service</th>
                <th className="py-3.5 px-5">Level</th>
                <th className="py-3.5 px-5">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {operationalLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5 font-mono text-[11px] text-slate-400">{log.timestampIST}</td>
                  <td className="py-4 px-5 font-bold text-slate-200">{log.service}</td>
                  <td className="py-4 px-5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {log.level}
                    </span>
                  </td>
                  <td className="py-4 px-5 text-slate-300">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeLayer === 'TELEMETRY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-5">Timestamp (IST)</th>
                <th className="py-3.5 px-5">App Version / OS</th>
                <th className="py-3.5 px-5">Event Code</th>
                <th className="py-3.5 px-5">Correlation ID</th>
                <th className="py-3.5 px-5">Sanitized Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {telemetryLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5 font-mono text-[11px] text-slate-400">{log.timestampIST}</td>
                  <td className="py-4 px-5 font-bold text-slate-200">{log.appVersion} • {log.os}</td>
                  <td className="py-4 px-5 font-mono text-accent-teal">{log.eventCode}</td>
                  <td className="py-4 px-5 font-mono text-[11px] text-slate-500">{log.correlationId}</td>
                  <td className="py-4 px-5 font-mono text-[11px] text-slate-400">
                    {JSON.stringify(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-heading font-bold text-sm text-white">Audit Event Details</h3>
                <span className="text-[10px] font-mono text-slate-400">{selectedLog.id}</span>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <div>Actor: <strong>{selectedLog.actor}</strong> ({selectedLog.role})</div>
              <div>Action: <strong>{selectedLog.action}</strong> on module <strong>{selectedLog.module}</strong></div>
              <div>IP Address: <span className="font-mono">{selectedLog.ip}</span></div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
              <pre>{JSON.stringify(selectedLog.diff, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
