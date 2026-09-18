import { useEffect, useState, useRef, useCallback } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import './index.css';
import Factory3D from './components/Factory3D';

// ─── Types ────────────────────────────────────────────────────────────────────

type Machine = {
  id: string;
  name: string;
  processing_time: number;
  status: string;
  queue: number;
  utilization: number;
  completed: number;
  downtime: number;
};

type EventLogItem = {
  type: string;
  message: string;
  timestamp: string;
  machine_id?: string;
};

type Bottleneck = {
  machine_id: string;
  machine_name: string;
  score: number;
  severity: string;
  reason: string;
  recommended_action: string;
};

type FactoryState = {
  factory_running: boolean;
  total_production: number;
  total_downtime: number;
  average_utilization: number;
  production_rate: number;
  bottleneck: Bottleneck | null;
  machines: Machine[];
  event_log?: EventLogItem[];
  demo_mode?: boolean;
  active_machines?: number;
};

type TrendPoint = {
  t: string;           // label: HH:MM:SS
  production: number;  // cumulative total
  rate: number;        // delta per poll
  utilization: number; // average utilization
  downtime: number;    // cumulative downtime
};

// ─── AI Insight generation ────────────────────────────────────────────────────

type Insight = {
  title: string;
  machine: string;
  issue: string;
  impact: string;
  action: string;
  improvement: string;
  severity: 'normal' | 'warning' | 'critical' | 'failure';
};

function generateInsight(state: FactoryState): Insight {
  const failedMachines = state.machines.filter(
    (m) => m.status.toLowerCase() === 'offline'
  );
  const bn = state.bottleneck;

  // Priority 1 — active machine failure
  if (failedMachines.length > 0) {
    const failed = failedMachines[0];
    return {
      title: 'Machine Failure Detected',
      machine: `${failed.id} — ${failed.name}`,
      issue: `${failed.name} is offline. ${failedMachines.length > 1 ? `${failedMachines.length} machines are currently offline.` : ''}`,
      impact: `Production output is reduced. Downstream machines may develop queue buildup. Accumulated downtime: ${failed.downtime}s.`,
      action: `Perform immediate inspection of ${failed.name}. Check hydraulics, power supply, and mechanical components. Click "Recover Machine" once repairs are complete.`,
      improvement: 'Restoring this machine will recover production flow and halt downtime accumulation.',
      severity: 'failure',
    };
  }

  // Priority 2 — critical bottleneck
  if (bn && bn.severity === 'critical') {
    return {
      title: 'Critical Bottleneck Identified',
      machine: `${bn.machine_id} — ${bn.machine_name}`,
      issue: `${bn.machine_name} utilization is critically high (${bn.reason}).`,
      impact: `Production throughput is severely constrained at the ${bn.machine_name} stage. Queue is backing up into upstream machines.`,
      action: bn.recommended_action,
      improvement: 'Reducing cycle time by 20% could restore normal queue levels within 3–5 minutes.',
      severity: 'critical',
    };
  }

  // Priority 3 — warning bottleneck
  if (bn && bn.severity === 'warning') {
    return {
      title: 'Bottleneck Warning',
      machine: `${bn.machine_id} — ${bn.machine_name}`,
      issue: `${bn.machine_name} is approaching capacity limits. ${bn.reason}.`,
      impact: 'Queue is growing. If unaddressed, this may escalate to a critical bottleneck within minutes.',
      action: bn.recommended_action,
      improvement: 'Early intervention at this stage prevents cascading production delays.',
      severity: 'warning',
    };
  }

  // Default — normal operation
  const bestMachine = state.machines.reduce((prev, curr) =>
    curr.utilization > prev.utilization ? curr : prev
  );
  return {
    title: 'Production Line Optimal',
    machine: `${bestMachine.id} — ${bestMachine.name}`,
    issue: `All machines are operating within normal parameters. Highest utilization: ${bestMachine.name} at ${bestMachine.utilization.toFixed(1)}%.`,
    impact: `Line utilization at ${state.average_utilization.toFixed(1)}%. ${state.active_machines ?? state.machines.length} of ${state.machines.length} machines active.`,
    action: 'No immediate action required. Continue monitoring for queue buildup or utilization spikes.',
    improvement: 'Current trajectory supports sustained production throughput.',
    severity: 'normal',
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API = 'http://127.0.0.1:8000';
const MAX_TREND_POINTS = 40;

const STATUS_LABELS: Record<string, string> = {
  running: 'RUNNING',
  offline: 'OFFLINE',
  bottleneck: 'BOTTLENECK',
  warning: 'WARNING',
  maintenance: 'MAINTENANCE',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState<FactoryState | null>(null);
  const [connected, setConnected] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const prevProductionRef = useRef(0);

  // ── Polling ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/factory/state`);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const json: FactoryState = await response.json();
      setData(json);
      setConnected(true);
      setError('');

      // Append trend point
      const now = new Date();
      const label = now.toLocaleTimeString();
      const delta = Math.max(0, json.total_production - prevProductionRef.current);
      prevProductionRef.current = json.total_production;
      setTrendData((prev) => {
        const next: TrendPoint = {
          t: label,
          production: json.total_production,
          rate: delta,
          utilization: parseFloat(json.average_utilization.toFixed(1)),
          downtime: json.total_downtime,
        };
        const updated = [...prev, next];
        return updated.length > MAX_TREND_POINTS
          ? updated.slice(updated.length - MAX_TREND_POINTS)
          : updated;
      });
    } catch (err) {
      console.error('Failed to fetch factory state:', err);
      setConnected(false);
      setError('Unable to connect to backend API');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 1500);
    return () => window.clearInterval(interval);
  }, [load]);

  // ── Action helper ──────────────────────────────────────────────────────────

  const post = useCallback(async (path: string, body?: unknown) => {
    setLoadingAction(true);
    setError('');
    try {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(`Action failed: ${response.status}`);
      await load();
    } catch (err) {
      console.error('Action failed:', err);
      setError('Action failed. Check backend API.');
    } finally {
      setLoadingAction(false);
    }
  }, [load]);

  // ── Cycle speed ────────────────────────────────────────────────────────────

  const handleSpeedChange = (machineId: string, currentTime: number, delta: number) => {
    const newTime = Math.max(0.5, Math.min(30, Math.round((currentTime + delta) * 10) / 10));
    post(`/api/factory/machine/${machineId}/speed`, { processing_time: newTime });
  };

  // ── Loading screen ─────────────────────────────────────────────────────────

  if (!data && !connected) {
    return (
      <main className="loading-screen">
        <div className="spinner" />
        <h1>Connecting to FactoryMind AI Digital Twin...</h1>
        <p>Ensure backend API is live at {API}</p>
        {error && <p className="error-message">{error}</p>}
      </main>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const insight = data ? generateInsight(data) : null;
  const activeMachineCount = data?.active_machines ?? data?.machines.filter((m) => m.status !== 'offline').length ?? 0;
  const currentBottleneckLabel = data?.bottleneck
    ? `${data.bottleneck.machine_id} — ${data.bottleneck.machine_name}`
    : 'None';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header>
        <div>
          <div className="badge-row">
            <small>INDUSTRIAL DIGITAL TWIN — JARVIS SI-02</small>
            <span className={`status-pill ${connected ? 'online' : 'offline'}`}>
              {connected ? '● LIVE ENGINE' : '○ RECONNECTING'}
            </span>
            {data?.demo_mode && (
              <span className="demo-badge">⚡ DEMO MODE ACTIVE</span>
            )}
          </div>
          <h1>FactoryMind AI</h1>
          <p>Production Line Bottleneck Intelligence &amp; Predictive Operations</p>
        </div>

        <div className="header-actions">
          <button
            className={`btn-toggle ${data?.factory_running ? 'btn-stop' : 'btn-start'}`}
            disabled={loadingAction}
            onClick={() => post(`/api/factory/${data?.factory_running ? 'stop' : 'start'}`)}
          >
            {data?.factory_running ? 'Pause Line' : 'Start Line'}
          </button>
          <button className="btn-reset" disabled={loadingAction} onClick={() => post('/api/factory/reset')}>
            Reset Factory
          </button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {/* ── Demo Control Bar ────────────────────────────────────────────────── */}
      <div className="demo-bar">
        <span className="demo-bar-label">Demo Controls</span>
        <div className="demo-bar-buttons">
          <button
            className="demo-btn"
            disabled={loadingAction}
            onClick={() => post('/api/factory/simulate/bottleneck')}
            title="Force a bottleneck on the highest-queue machine"
          >
            ⚠ Simulate Bottleneck
          </button>
          {data?.demo_mode ? (
            <button
              className="demo-btn demo-btn-stop"
              disabled={loadingAction}
              onClick={() => post('/api/factory/demo/stop')}
            >
              ■ Stop Demo
            </button>
          ) : (
            <button
              className="demo-btn demo-btn-start"
              disabled={loadingAction}
              onClick={() => post('/api/factory/demo/start')}
            >
              ▶ Start Demo
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards (6) ──────────────────────────────────────────────────── */}
      <section className="kpis kpis-6">
        <article>
          <span>Total Production</span>
          <strong>{data?.total_production ?? 0} units</strong>
        </article>
        <article>
          <span>Production Rate</span>
          <strong>{data?.production_rate ?? 0} parts/min</strong>
        </article>
        <article>
          <span>Line Utilization</span>
          <strong>{data?.average_utilization?.toFixed(1) ?? '0.0'}%</strong>
        </article>
        <article>
          <span>Accumulated Downtime</span>
          <strong>{data?.total_downtime ?? 0}s</strong>
        </article>
        <article>
          <span>Active Machines</span>
          <strong className={activeMachineCount < (data?.machines.length ?? 5) ? 'kpi-warn' : ''}>
            {activeMachineCount} / {data?.machines.length ?? 5}
          </strong>
        </article>
        <article>
          <span>Current Bottleneck</span>
          <strong className={data?.bottleneck ? 'kpi-alert' : 'kpi-ok'}>
            {currentBottleneckLabel}
          </strong>
        </article>
      </section>

      {/* ── Production Line Topology ────────────────────────────────────────── */}
      <section className="panel">
        <div className="panel-header">
          <h2>Production Line Topology</h2>
          <small>
            {data?.factory_running ? 'STATUS: SIMULATION ACTIVE' : 'STATUS: SIMULATION PAUSED'}
          </small>
        </div>

        <div className="machines">
          {data?.machines?.map((machine) => {
            const s = machine.status.toLowerCase();
            const isOffline = s === 'offline';
            const cardClass = ['machine', isOffline ? 'offline' : '', s === 'bottleneck' ? 'bottleneck-card' : ''].filter(Boolean).join(' ');

            return (
              <article key={machine.id} className={cardClass}>
                <div className="machine-header">
                  <b>{machine.id}</b>
                  <span className={`machine-status-tag ${s}`}>
                    {STATUS_LABELS[s] ?? s.toUpperCase()}
                  </span>
                </div>

                {/* Status indicator dot */}
                <div className={`status-dot-row`}>
                  <span className={`status-dot status-dot-${s}`} />
                  <h3>{machine.name}</h3>
                </div>

                <p>Queue: <strong>{machine.queue} parts</strong></p>

                <div className="cycle-speed-control">
                  <span className="speed-label">Cycle Speed:</span>
                  <div className="speed-stepper">
                    <button
                      className="btn-step"
                      disabled={loadingAction || machine.processing_time <= 0.5}
                      onClick={() => handleSpeedChange(machine.id, machine.processing_time, -0.5)}
                      title="Speed up machine cycle"
                    >
                      −
                    </button>
                    <strong className="speed-val">{machine.processing_time.toFixed(1)}s</strong>
                    <button
                      className="btn-step"
                      disabled={loadingAction || machine.processing_time >= 30}
                      onClick={() => handleSpeedChange(machine.id, machine.processing_time, 0.5)}
                      title="Slow down machine cycle"
                    >
                      +
                    </button>
                  </div>
                </div>

                <p>Utilization: <strong>{machine.utilization.toFixed(1)}%</strong></p>
                <div className="bar">
                  <i
                    className={`bar-fill-${s}`}
                    style={{ width: `${Math.min(100, Math.max(0, machine.utilization))}%` }}
                  />
                </div>

                <div className="machine-stats-row">
                  <span>Completed: <strong>{machine.completed}</strong></span>
                  <span>Downtime: <strong>{machine.downtime}s</strong></span>
                </div>

                <button
                  className={isOffline ? 'btn-recover' : 'btn-fail'}
                  disabled={loadingAction}
                  onClick={() =>
                    post(`/api/factory/${isOffline ? 'recover' : 'failure'}/${machine.id}`)
                  }
                >
                  {isOffline ? '✔ Recover Machine' : '✕ Simulate Failure'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── AI Insight Panel ────────────────────────────────────────────────── */}
      {insight && (
        <section className={`insight-panel insight-${insight.severity}`}>
          <div className="insight-header">
            <div>
              <small>FACTORYMIND AI INSIGHTS — INTELLIGENT RULE-BASED RECOMMENDATION ENGINE</small>
              <h2>{insight.title}</h2>
            </div>
            <span className={`insight-badge insight-badge-${insight.severity}`}>
              {insight.severity.toUpperCase()}
            </span>
          </div>

          <div className="insight-machine">
            <span className={`insight-machine-dot status-dot-${data?.machines.find(m => `${m.id} — ${m.name}` === insight.machine)?.status ?? 'running'}`} />
            <strong>{insight.machine}</strong>
          </div>

          <div className="insight-grid">
            <div className="insight-row">
              <span className="insight-label">Current Issue</span>
              <p className="insight-value">{insight.issue}</p>
            </div>
            <div className="insight-row">
              <span className="insight-label">Operational Impact</span>
              <p className="insight-value">{insight.impact}</p>
            </div>
            <div className="insight-row">
              <span className="insight-label">Recommended Action</span>
              <p className="insight-value insight-action">{insight.action}</p>
            </div>
            <div className="insight-row">
              <span className="insight-label">Expected Improvement</span>
              <p className="insight-value">{insight.improvement}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── Bottleneck Alert ────────────────────────────────────────────────── */}
      {data?.bottleneck && (
        <section className={`alert ${data.bottleneck.severity}`}>
          <div className="alert-header">
            <small>
              AI-ASSISTED BOTTLENECK DETECTION [{data.bottleneck.severity.toUpperCase()}]
            </small>
            <span className="score-badge">Impact Score: {data.bottleneck.score}</span>
          </div>
          <h2>
            {data.bottleneck.machine_id} — {data.bottleneck.machine_name}
          </h2>
          <p className="reason">
            <strong>Root Cause:</strong> {data.bottleneck.reason}
          </p>
          <p className="recommendation">
            <strong>Recommended Action:</strong> {data.bottleneck.recommended_action}
          </p>
        </section>
      )}

      {/* ── Production Trend Chart ──────────────────────────────────────────── */}
      <section className="panel chart-panel">
        <div className="panel-header">
          <h2>Production Trend</h2>
          <small>LIVE — last {trendData.length} samples</small>
        </div>

        {trendData.length < 2 ? (
          <p className="chart-placeholder">Collecting data… start the factory simulation to see the trend.</p>
        ) : (
          <div className="chart-grid">
            {/* Production + Utilization */}
            <div className="chart-block">
              <p className="chart-title">Cumulative Production &amp; Utilization</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradUtil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} unit="%" />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Area yAxisId="left" type="monotone" dataKey="production" name="Total Production" stroke="#22d3ee" fill="url(#gradProd)" dot={false} strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="utilization" name="Avg Utilization %" stroke="#22c55e" dot={false} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Rate + Downtime */}
            <div className="chart-block">
              <p className="chart-title">Production Rate &amp; Downtime</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} unit="s" />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar yAxisId="left" dataKey="rate" name="Rate (parts/poll)" fill="#38bdf8" radius={[2, 2, 0, 0]} maxBarSize={16} />
                  <Line yAxisId="right" type="monotone" dataKey="downtime" name="Downtime (s)" stroke="#f87171" dot={false} strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ── Telemetry Event Stream ──────────────────────────────────────────── */}
      {data?.event_log && data.event_log.length > 0 && (
        <section className="panel event-log-panel">
          <h2>Telemetry Event Stream</h2>
          <ul className="event-list">
            {[...data.event_log].reverse().map((event, index) => (
              <li key={`${event.timestamp}-${index}`} className={`event-item ${event.type}`}>
                <span className="event-time">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className="event-msg">{event.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 3D Digital Twin ─────────────────────────────────────────────────── */}
      <Factory3D machines={data?.machines ?? []} />

    </main>
  );
}