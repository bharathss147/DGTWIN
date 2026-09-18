import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import './index.css';
import Factory3D, { MachineData, RepairStatus } from './components/Factory3D';

// ─── Types ────────────────────────────────────────────────────────────────────

type Bottleneck = {
  machine_id: string;
  machine_name: string;
  score: number;
  severity: string;
  reason: string;
  recommended_action: string;
};

type EventLogItem = {
  type: string;
  message: string;
  timestamp: string;
  machine_id?: string;
  phase?: string;
};

type AIDiagnosis = {
  active: boolean;
  phase: string;
  machine_id: string | null;
  root_cause: string | null;
  confidence: number;
  impact_production_pct: number;
  affected_stage: string | null;
  downstream_impact: string | null;
  recommended_action: string | null;
  timestamp: string | null;
};

type RepairTask = {
  name: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed';
};

type FullRepairStatus = {
  active: boolean;
  target_machine: string | null;
  progress: number;
  current_task: string | null;
  tasks?: RepairTask[];
  validation_results?: Record<string, string>;
};

type AlertItem = {
  machine: string;
  severity: string;
  title: string;
  details: string;
  timestamp: string;
};

type FactoryState = {
  factory_running: boolean;
  total_production: number;
  total_downtime: number;
  average_utilization: number;
  production_rate: number;
  bottleneck: Bottleneck | null;
  machines: MachineData[];
  event_log?: EventLogItem[];
  demo_mode?: boolean;
  demo_phase?: string;
  active_machines?: number;
  factory_health?: number;
  ai_diagnosis?: AIDiagnosis;
  repair_status?: FullRepairStatus;
  active_alerts?: AlertItem[];
};

type TelemetryTrendPoint = {
  t: string;
  production: number;
  rate: number;
  utilization: number;
  m2_temp: number;
  m2_vib: number;
};

const API = 'http://127.0.0.1:8000';
const MAX_TREND_POINTS = 35;

// ─── Circular Health Score Component ──────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const radius = 38;
  const stroke = 7;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = '#10b981'; // green
  if (score < 60) color = '#ef4444'; // red
  else if (score < 80) color = '#f59e0b'; // yellow

  return (
    <div className="health-gauge-wrap">
      <svg height={radius * 2} width={radius * 2} className="health-gauge-svg">
        <circle
          stroke="#1e293b"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="health-gauge-val">
        <span className="health-gauge-num" style={{ color }}>{score}%</span>
        <span className="health-gauge-label">HEALTH</span>
      </div>
    </div>
  );
}

// ─── Main Application Component ───────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState<FactoryState | null>(null);
  const [connected, setConnected] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [trendData, setTrendData] = useState<TelemetryTrendPoint[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);

  // ── Polling State ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/factory/state`);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const json: FactoryState = await response.json();
      setData(json);
      setConnected(true);
      setError('');

      // Add to telemetry trend
      const now = new Date();
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const m2 = json.machines?.find((m) => m.id === 'M2');

      setTrendData((prev) => {
        const nextPoint: TelemetryTrendPoint = {
          t: timeLabel,
          production: json.total_production,
          rate: json.production_rate,
          utilization: parseFloat(json.average_utilization.toFixed(1)),
          m2_temp: m2?.temperature ? parseFloat(m2.temperature.toFixed(1)) : 52.0,
          m2_vib: m2?.vibration ? parseFloat(m2.vibration.toFixed(2)) : 2.1,
        };
        const updated = [...prev, nextPoint];
        return updated.length > MAX_TREND_POINTS ? updated.slice(updated.length - MAX_TREND_POINTS) : updated;
      });
    } catch (err) {
      console.error('Failed to fetch factory state:', err);
      setConnected(false);
      setError('Unable to connect to FactoryMind AI backend API');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 1200);
    return () => window.clearInterval(interval);
  }, [load]);

  // ── Action Dispatcher ──────────────────────────────────────────────────────
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
      setError('Action failed. Verify backend API connection.');
    } finally {
      setLoadingAction(false);
    }
  }, [load]);

  // Cycle speed adjuster
  const handleSpeedChange = (machineId: string, currentTime: number, delta: number) => {
    const newTime = Math.max(0.5, Math.min(30, Math.round((currentTime + delta) * 10) / 10));
    post(`/api/factory/machine/${machineId}/speed`, { processing_time: newTime });
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const healthScore = data?.factory_health ?? 96;
  const activeMachineCount = data?.active_machines ?? 5;
  const isolatedMachine = useMemo(
    () => data?.machines?.find((m) => m.isolated || m.status === 'malfunction'),
    [data?.machines]
  );
  const aiDiag = data?.ai_diagnosis;
  const repair = data?.repair_status;

  // ── Connection Loading Screen ──────────────────────────────────────────────
  if (!data && !connected) {
    return (
      <main className="loading-screen">
        <div className="spinner" />
        <h1 style={{ color: '#06b6d4', marginTop: 16 }}>Connecting to FactoryMind AI Digital Twin...</h1>
        <p style={{ color: '#94a3b8' }}>Establishing live link to simulated industrial engine at {API}</p>
        {error && <p className="error-message">{error}</p>}
      </main>
    );
  }

  return (
    <main className={presentationMode ? 'presentation-mode' : ''}>

      {/* ── Top Command Center Bar ─────────────────────────────────────────── */}
      <header className="command-header">
        <div className="brand-zone">
          <div className="badge-row">
            <span className="badge-si">JARVIS SI-02</span>
            <span className={`status-pill ${connected ? 'online' : 'offline'}`}>
              {connected ? '● DIGITAL TWIN ENGINE LIVE' : '○ RECONNECTING'}
            </span>
            <span className="ai-status-pill">
              AI ENGINE: {isolatedMachine ? 'AUTONOMOUS INTERVENTION' : 'CONTINUOUS MONITORING'}
            </span>
            {data?.demo_mode && (
              <span className="demo-badge">⚡ AUTONOMOUS DEMO RUNNING: {data?.demo_phase?.toUpperCase()}</span>
            )}
          </div>
          <h1>FactoryMind AI</h1>
          <p className="subtitle">High-Fidelity Autonomous Digital Twin &amp; Predictive Self-Healing Smart Factory</p>
        </div>

        <div className="header-actions">
          <button
            className={`btn-toggle ${data?.factory_running ? 'btn-stop' : 'btn-start'}`}
            disabled={loadingAction}
            onClick={() => post(`/api/factory/${data?.factory_running ? 'stop' : 'start'}`)}
          >
            {data?.factory_running ? '⏸ Pause Line' : '▶ Start Line'}
          </button>
          <button
            className="btn-reset"
            disabled={loadingAction}
            onClick={() => post('/api/factory/reset')}
          >
            ↺ Reset Factory
          </button>
          <button
            className={`btn-presentation ${presentationMode ? 'active' : ''}`}
            onClick={() => setPresentationMode(!presentationMode)}
            title="Toggle high-contrast full-stage presentation mode"
          >
            {presentationMode ? 'Exit Presentation' : '🖥 Presentation Mode'}
          </button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {/* ── One-Click Autonomous Demo Controller Bar ──────────────────────── */}
      <div className="demo-controller-bar">
        <div className="demo-meta">
          <span className="demo-title">AUTONOMOUS FACTORY DEMO CONTROLLER</span>
          <span className="demo-subtitle">Demonstrates full lifecycle: Drift → Anomaly → Diagnosis → Isolation → Repair → Validation → Recovery</span>
        </div>
        <div className="demo-actions">
          {data?.demo_mode ? (
            <button
              className="demo-btn-main demo-btn-stop"
              disabled={loadingAction}
              onClick={() => post('/api/factory/demo/stop')}
            >
              ■ Stop Demo
            </button>
          ) : (
            <button
              className="demo-btn-main demo-btn-start"
              disabled={loadingAction}
              onClick={() => post('/api/factory/demo/start')}
            >
              ▶ START AUTONOMOUS FACTORY DEMO
            </button>
          )}
          <button
            className="demo-btn-sub"
            disabled={loadingAction}
            onClick={() => post('/api/factory/demo/skip-failure')}
            title="Jump directly to M2 Drilling anomaly and safety isolation"
          >
            ⚡ Skip to Malfunction
          </button>
          <button
            className="demo-btn-sub"
            disabled={loadingAction}
            onClick={() => post('/api/factory/demo/skip-repair')}
            title="Launch autonomous maintenance robot and repair sequence"
          >
            🔧 Skip to Repair
          </button>
          <button
            className="demo-btn-sub"
            disabled={loadingAction}
            onClick={() => post('/api/factory/demo/reset')}
          >
            ↺ Reset Demo
          </button>
        </div>
      </div>

      {/* ── Emergency Safety Isolation Banner ─────────────────────────────── */}
      {isolatedMachine && (
        <div className="safety-isolation-banner">
          <div className="safety-badge">AUTOMATIC SAFETY ISOLATION ACTIVE</div>
          <div className="safety-content">
            <strong>Machine {isolatedMachine.id} ({isolatedMachine.name}) Decoupled from Production Line</strong>
            <span>{isolatedMachine.isolation_reason ?? 'Vibration & thermal threshold violation. Material feed diverted.'}</span>
          </div>
          <button
            className="safety-recover-btn"
            disabled={loadingAction}
            onClick={() => post(`/api/factory/recover/${isolatedMachine.id}`)}
          >
            Recover Machine Manually
          </button>
        </div>
      )}

      {/* ── Top Industrial KPIs + Factory Health Dial ──────────────────────── */}
      <section className="kpis-bar">
        {/* Animated Health Gauge */}
        <article className="kpi-card health-card">
          <HealthGauge score={healthScore} />
          <div className="health-meta">
            <span className="kpi-label">FACTORY HEALTH SCORE</span>
            <strong className="kpi-num">{healthScore}%</strong>
            <span className="kpi-subtext">
              {healthScore > 85 ? 'Line Operating at Optimal Efficiency' : healthScore > 65 ? 'Warning: Sensor Drift Detected' : 'CRITICAL: Machine Isolated'}
            </span>
          </div>
        </article>

        <article className="kpi-card">
          <span className="kpi-label">Total Production</span>
          <strong className="kpi-num">{data?.total_production ?? 0} <small>units</small></strong>
          <span className="kpi-subtext">Continuous Output Flow</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-label">Production Rate</span>
          <strong className="kpi-num">{data?.production_rate?.toFixed(1) ?? '42.0'} <small>parts/min</small></strong>
          <span className="kpi-subtext">{isolatedMachine ? 'Reduced due to isolation' : 'Nominal throughput'}</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-label">Line Utilization</span>
          <strong className="kpi-num">{data?.average_utilization?.toFixed(1) ?? '0.0'}%</strong>
          <span className="kpi-subtext">Across 5 CNC/Robotic cells</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-label">Accumulated Downtime</span>
          <strong className={`kpi-num ${data?.total_downtime ? 'alert-color' : ''}`}>
            {data?.total_downtime ?? 0}s
          </strong>
          <span className="kpi-subtext">Total line interruption</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-label">Active Machines</span>
          <strong className={`kpi-num ${activeMachineCount < 5 ? 'warn-color' : ''}`}>
            {activeMachineCount} / 5
          </strong>
          <span className="kpi-subtext">{5 - activeMachineCount} currently offline/isolated</span>
        </article>
      </section>

      {/* ── AI Diagnosis & Autonomous Repair Interactive Grid ─────────────── */}
      {(aiDiag?.active || repair?.active) && (
        <section className="autonomous-ops-grid">

          {/* AI-Assisted Diagnostic Engine Panel */}
          {aiDiag?.active && (
            <div className="diag-panel">
              <div className="panel-tag">AI-ASSISTED DIAGNOSTIC SIMULATION</div>
              <div className="diag-header">
                <div className="diag-title">
                  <span className="pulse-icon">◆</span>
                  <h3>FACTORYMIND AI — DIAGNOSTIC ENGINE</h3>
                </div>
                <span className="confidence-pill">{aiDiag.confidence}% CONFIDENCE</span>
              </div>

              <div className="diag-steps">
                <div className="diag-step-item completed">✓ Telemetry Analyzed</div>
                <div className="diag-step-item completed">✓ Harmonics Correlated</div>
                <div className="diag-step-item active">▶ Root Cause Identified</div>
              </div>

              <div className="diag-body">
                <div className="diag-row">
                  <span className="diag-key">ROOT CAUSE:</span>
                  <span className="diag-val root-cause-text">{aiDiag.root_cause}</span>
                </div>
                <div className="diag-details-grid">
                  <div>
                    <span className="diag-key">AFFECTED STAGE:</span>
                    <p className="diag-val">{aiDiag.affected_stage}</p>
                  </div>
                  <div>
                    <span className="diag-key">THROUGHPUT IMPACT:</span>
                    <p className="diag-val alert-color">{aiDiag.impact_production_pct}% Production Rate</p>
                  </div>
                  <div>
                    <span className="diag-key">DOWNSTREAM BUFFER:</span>
                    <p className="diag-val">{aiDiag.downstream_impact}</p>
                  </div>
                  <div>
                    <span className="diag-key">RECOMMENDED ACTION:</span>
                    <p className="diag-val action-text">{aiDiag.recommended_action}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Autonomous Maintenance Tracker Panel */}
          {repair?.active && (
            <div className="repair-panel">
              <div className="panel-tag">AUTONOMOUS REPAIR WORKFLOW</div>
              <div className="repair-header">
                <div>
                  <h3>AUTONOMOUS MAINTENANCE UNIT — {repair.target_machine}</h3>
                  <span className="repair-task-name">Current Task: {repair.current_task ?? 'Executing Diagnostics'}</span>
                </div>
                <span className="repair-pct">{repair.progress}%</span>
              </div>

              {/* Progress bar */}
              <div className="repair-progress-track">
                <div
                  className="repair-progress-bar"
                  style={{ width: `${repair.progress}%` }}
                />
              </div>

              {/* Subtask checklist */}
              <div className="repair-task-list">
                {repair.tasks?.map((task, idx) => (
                  <div key={idx} className={`repair-task-card ${task.status}`}>
                    <div className="task-info">
                      <span className="task-status-indicator">
                        {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○'}
                      </span>
                      <span className="task-name">{task.name}</span>
                    </div>
                    <span className="task-pct">{task.progress}%</span>
                  </div>
                ))}
              </div>

              {/* Validation Results Matrix */}
              {repair.validation_results && (
                <div className="validation-box">
                  <span className="val-title">AUTOMATED SENSOR VALIDATION CHECK</span>
                  <div className="val-grid">
                    {Object.entries(repair.validation_results).map(([param, res]) => (
                      <div key={param} className="val-item">
                        <span className="val-param">{param.toUpperCase()}</span>
                        <span className={`val-badge ${res.includes('NORMAL') ? 'pass' : 'checking'}`}>{res}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 3D High-Fidelity Digital Twin ─────────────────────────────────── */}
      <Factory3D
        machines={data?.machines ?? []}
        repairStatus={data?.repair_status}
        selectedMachineId={selectedMachineId}
        onSelectMachine={setSelectedMachineId}
        presentationMode={presentationMode}
      />

      {/* ── Real-Time Machine Sensor Matrix ────────────────────────────────── */}
      <section className="panel sensor-matrix-section">
        <div className="panel-header">
          <div>
            <h2>Real-Time Industrial Sensor Telemetry</h2>
            <p className="panel-sub">Continuous IoT monitoring: Temperature, Vibration, Motor RPM, Power, and Machine Health</p>
          </div>
          <span className="telemetry-badge">5 STAGES CONNECTED</span>
        </div>

        <div className="sensor-cards-grid">
          {data?.machines?.map((m) => {
            const isWarn = (m.temperature ?? 0) > 70 || (m.vibration ?? 0) > 4.5;
            const isCritical = m.isolated || m.status === 'malfunction' || (m.temperature ?? 0) > 85;

            return (
              <div
                key={m.id}
                className={`machine-telemetry-card ${isCritical ? 'card-critical' : isWarn ? 'card-warn' : ''} ${selectedMachineId === m.id ? 'card-selected' : ''}`}
                onClick={() => setSelectedMachineId(selectedMachineId === m.id ? null : m.id)}
              >
                <div className="mc-header">
                  <div className="mc-title">
                    <span className="mc-id">{m.id}</span>
                    <strong>{m.name}</strong>
                  </div>
                  <span className={`status-tag status-${m.status.toLowerCase()} ${m.isolated ? 'status-isolated' : ''}`}>
                    {m.isolated ? 'ISOLATED' : m.status.toUpperCase()}
                  </span>
                </div>

                <div className="mc-health-bar">
                  <div
                    className="mc-health-fill"
                    style={{
                      width: `${m.health ?? 95}%`,
                      background: (m.health ?? 95) > 80 ? '#10b981' : (m.health ?? 95) > 50 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>

                <div className="sensor-readings">
                  <div className="reading-item">
                    <span className="read-label">TEMP</span>
                    <strong className={`read-val ${(m.temperature ?? 0) > 75 ? 'alert-color' : ''}`}>
                      {m.temperature?.toFixed(1) ?? '52.0'}°C
                    </strong>
                  </div>
                  <div className="reading-item">
                    <span className="read-label">VIB</span>
                    <strong className={`read-val ${(m.vibration ?? 0) > 5.0 ? 'alert-color' : ''}`}>
                      {m.vibration?.toFixed(2) ?? '1.80'} mm/s
                    </strong>
                  </div>
                  <div className="reading-item">
                    <span className="read-label">RPM</span>
                    <strong className="read-val">{m.rpm ?? 1420}</strong>
                  </div>
                  <div className="reading-item">
                    <span className="read-label">POWER</span>
                    <strong className="read-val">{m.power?.toFixed(1) ?? '6.5'} kW</strong>
                  </div>
                  <div className="reading-item">
                    <span className="read-label">QUEUE</span>
                    <strong className={`read-val ${m.queue > 15 ? 'warn-color' : ''}`}>{m.queue}</strong>
                  </div>
                  <div className="reading-item">
                    <span className="read-label">CYCLE</span>
                    <strong className="read-val">{m.processing_time.toFixed(1)}s</strong>
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    className="speed-btn"
                    disabled={loadingAction}
                    onClick={(e) => { e.stopPropagation(); handleSpeedChange(m.id, m.processing_time, -0.5); }}
                    title="Speed up cycle"
                  >
                    -0.5s
                  </button>
                  <button
                    className="speed-btn"
                    disabled={loadingAction}
                    onClick={(e) => { e.stopPropagation(); handleSpeedChange(m.id, m.processing_time, 0.5); }}
                    title="Slow down cycle"
                  >
                    +0.5s
                  </button>
                  {m.status === 'offline' || m.isolated ? (
                    <button
                      className="recover-btn"
                      disabled={loadingAction}
                      onClick={(e) => { e.stopPropagation(); post(`/api/factory/recover/${m.id}`); }}
                    >
                      Recover
                    </button>
                  ) : (
                    <button
                      className="fail-btn"
                      disabled={loadingAction}
                      onClick={(e) => { e.stopPropagation(); post(`/api/factory/failure/${m.id}`); }}
                      title="Trigger manual failure"
                    >
                      Fail
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Real-Time Telemetry Trend & Charts Grid ────────────────────────── */}
      <section className="charts-grid">
        {/* Sensor Drift Tracking Chart (M2 Temp & Vibration) */}
        <div className="panel chart-card">
          <div className="chart-header">
            <h3>Industrial Sensor Drift Monitoring (M2 Drilling)</h3>
            <span className="chart-sub">Real-time tracking of thermal rise and bearing vibration</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#ef4444" domain={[30, 95]} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line yAxisId="left" type="monotone" dataKey="m2_temp" name="Temp (°C)" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="m2_vib" name="Vibration (mm/s)" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Production & Line Utilization Trend */}
        <div className="panel chart-card">
          <div className="chart-header">
            <h3>Cumulative Output &amp; Line Utilization</h3>
            <span className="chart-sub">System throughput with dynamic rate stabilization</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={trendData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="t" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area type="monotone" dataKey="production" name="Total Production" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
              <Area type="monotone" dataKey="utilization" name="Avg Utilization (%)" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Factory Event Timeline ─────────────────────────────────────────── */}
      <section className="panel timeline-section">
        <div className="panel-header">
          <h2>Factory Event Timeline</h2>
          <span className="timeline-count">{data?.event_log?.length ?? 0} Recorded Events</span>
        </div>

        <div className="timeline-container">
          {data?.event_log && data.event_log.length > 0 ? (
            data.event_log.slice().reverse().map((ev, idx) => (
              <div key={idx} className="timeline-row">
                <div className="time-col">
                  <span className="time-badge">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="timeline-connector">
                  <div className={`timeline-dot dot-${ev.type}`} />
                  {idx < (data.event_log?.length ?? 0) - 1 && <div className="timeline-line" />}
                </div>
                <div className="event-content">
                  {ev.phase && <span className="phase-pill">{ev.phase}</span>}
                  <span className="event-msg">{ev.message}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="timeline-empty">All factory stages running nominally. No critical events logged.</div>
          )}
        </div>
      </section>

    </main>
  );
}