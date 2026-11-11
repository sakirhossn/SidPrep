'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Shield,
  Activity,
  Smartphone,
  Eye,
  X,
  Filter,
  RefreshCw,
  Search,
  Trash2,
  Calendar,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminLogsPage() {
  const [activeLayer, setActiveLayer] = useState<'AUDIT' | 'OPERATIONAL' | 'TELEMETRY'>('AUDIT');
  const [timezone, setTimezone] = useState<'IST' | 'UTC'>('IST');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Live Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Purge Modal State
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeOlderThanDays, setPurgeOlderThanDays] = useState(30);
  const [purgeLayer, setPurgeLayer] = useState<'operational' | 'telemetry' | 'both'>('both');
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      let endpoint = '/v1/admin/logs/audit';
      if (activeLayer === 'OPERATIONAL') endpoint = '/v1/admin/logs/operational';
      if (activeLayer === 'TELEMETRY') endpoint = '/v1/admin/logs/telemetry';

      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('limit', '100');

      const res = await fetch(`${API_BASE}${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : data.logs || []);
      } else {
        setLogs([]);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [activeLayer, search, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handlePurge = async () => {
    setPurging(true);
    setPurgeMessage(null);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/logs/purge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          layer: purgeLayer,
          olderThanDays: purgeOlderThanDays,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPurgeMessage(data.message || `Purged ${data.purgedCount} log records.`);
        fetchLogs();
      } else {
        setPurgeMessage(data?.error?.message || 'Purge failed.');
      }
    } catch (err: any) {
      setPurgeMessage(err.message || 'Error purging logs');
    } finally {
      setPurging(false);
    }
  };

  const formatTimestamp = (isoStr: string) => {
    if (!isoStr) return 'Not recorded';
    try {
      const d = new Date(isoStr);
      if (timezone === 'UTC') {
        return d.toUTCString();
      }
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(d) + ' IST';
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-primary" />
            3-Layer Central Log Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable Audit Trail • Operational & Background Logs • Sanitized Student Telemetry
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timezone Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setTimezone('IST')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                timezone === 'IST' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Asia/Kolkata (IST)
            </button>
            <button
              onClick={() => setTimezone('UTC')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                timezone === 'UTC' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              UTC
            </button>
          </div>

          {/* Retention Purge Modal Button */}
          <button
            onClick={() => {
              setPurgeMessage(null);
              setPurgeModalOpen(true);
            }}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            Retention Purge
          </button>
        </div>
      </div>

      {/* Layer Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setActiveLayer('AUDIT')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-heading font-bold text-xs transition-all ${
            activeLayer === 'AUDIT'
              ? 'bg-primary text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Shield className="w-4 h-4" />
          Layer 1: Security Audit Trail
        </button>

        <button
          onClick={() => setActiveLayer('OPERATIONAL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-heading font-bold text-xs transition-all ${
            activeLayer === 'OPERATIONAL'
              ? 'bg-primary text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          Layer 2: Operational Health & Workers
        </button>

        <button
          onClick={() => setActiveLayer('TELEMETRY')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-heading font-bold text-xs transition-all ${
            activeLayer === 'TELEMETRY'
              ? 'bg-primary text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Layer 3: Client App Telemetry
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-center gap-3 justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeLayer.toLowerCase()} logs...`}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            />
          </div>

          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            <span className="text-xs text-slate-400 font-medium">Fetching real server logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            No log events found matching the active criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-4">Timestamp ({timezone})</th>
                  {activeLayer === 'AUDIT' && (
                    <>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Module</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target / IP</th>
                    </>
                  )}
                  {activeLayer === 'OPERATIONAL' && (
                    <>
                      <th className="py-3 px-4">Service</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Message</th>
                    </>
                  )}
                  {activeLayer === 'TELEMETRY' && (
                    <>
                      <th className="py-3 px-4">App Version</th>
                      <th className="py-3 px-4">OS Platform</th>
                      <th className="py-3 px-4">Event Code</th>
                      <th className="py-3 px-4">Correlation ID</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log: any, idx: number) => {
                  const ts = log.timestamp || log.createdAt || log.timestampIST;
                  return (
                    <tr key={log.id || idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap text-[11px]">
                        {formatTimestamp(ts)}
                      </td>

                      {activeLayer === 'AUDIT' && (
                        <>
                          <td className="py-3 px-4 text-white font-medium">{log.actorEmail || log.actor || 'System'}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700">
                              {log.actorRole || log.role || 'STAFF'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-primary font-mono text-[11px]">{log.module}</td>
                          <td className="py-3 px-4 text-white font-semibold">{log.action}</td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                            {log.targetId || log.target || 'N/A'} • {log.ipAddress || log.ip || 'Not recorded'}
                          </td>
                        </>
                      )}

                      {activeLayer === 'OPERATIONAL' && (
                        <>
                          <td className="py-3 px-4 text-white font-mono text-[11px]">{log.service}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.level === 'ERROR'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : log.level === 'WARN'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {log.level}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 max-w-md truncate">{log.message}</td>
                        </>
                      )}

                      {activeLayer === 'TELEMETRY' && (
                        <>
                          <td className="py-3 px-4 font-mono text-slate-300">{log.appVersion || 'v1.0.0'}</td>
                          <td className="py-3 px-4 uppercase text-slate-400 font-semibold">{log.os || 'ANDROID'}</td>
                          <td className="py-3 px-4 font-mono text-primary text-[11px]">{log.eventCode}</td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[10px]">{log.correlationId || 'none'}</td>
                        </>
                      )}

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 inline mr-1" />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-primary" />
                Inspect Log Entry: <span className="font-mono text-xs text-primary">{selectedLog.id}</span>
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">TIMESTAMP</span>
                  <span className="text-white">{formatTimestamp(selectedLog.timestamp || selectedLog.createdAt)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">EVENT CLASSIFICATION</span>
                  <span className="text-white">{selectedLog.module || selectedLog.service || selectedLog.eventCode}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-300 mb-2 block">
                  Sanitized Metadata / Payload Diff
                </span>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed">
                  {JSON.stringify(
                    selectedLog.changesDiff || selectedLog.meta || selectedLog.sanitizedMetadata || selectedLog.metadata || selectedLog,
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retention Purge Modal */}
      {purgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-500" />
                Purge Old Logs
              </h2>
              <button
                onClick={() => setPurgeModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Purges operational health or telemetry records older than the selected retention window. System audit logs (Layer 1) are strictly immutable and will not be erased.
            </p>

            {purgeMessage && (
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-emerald-400 text-xs font-medium">
                {purgeMessage}
              </div>
            )}

            <div className="space-y-3 pt-1 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Target Log Layer</label>
                <select
                  value={purgeLayer}
                  onChange={(e) => setPurgeLayer(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                >
                  <option value="both">Layer 2 & Layer 3 (Operational + Telemetry)</option>
                  <option value="operational">Layer 2 (Operational Logs Only)</option>
                  <option value="telemetry">Layer 3 (Client Telemetry Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Retention Cutoff</label>
                <select
                  value={purgeOlderThanDays}
                  onChange={(e) => setPurgeOlderThanDays(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                >
                  <option value={7}>Older than 7 days</option>
                  <option value={30}>Older than 30 days</option>
                  <option value={90}>Older than 90 days</option>
                </select>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setPurgeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={purging}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
              >
                {purging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Purge Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
