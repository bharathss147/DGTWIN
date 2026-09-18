"""
main.py — FactoryMind AI FastAPI application entry point.

High-Fidelity Autonomous Digital Twin Backend:
  - Real-time sensor simulation (temperature, vibration, RPM, power, pressure, health)
  - Full machine lifecycle states: running, warning, anomaly, malfunction, diagnosing, repairing, testing, recovered
  - Automatic safety isolation with upstream/downstream conveyor and queue impact
  - AI-assisted diagnostic engine simulation with root cause correlation
  - Autonomous maintenance and multi-step repair workflow
  - System health checks and automated recovery sequence
  - Comprehensive demo controls: start, stop/pause, reset, skip-to-failure, skip-to-repair
  - Preserves all existing endpoints, database persistence, and analytics routers
"""

from datetime import datetime, timezone
import math
import random
import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Database setup ────────────────────────────────────────────────────────────
from app.database import SessionLocal, init_db
from app.db_models import BottleneckRecord, FailureRecord, Machine, ProductionRecord

# ─── Routers ───────────────────────────────────────────────────────────────────
from app.routes.dataset import router as dataset_router
from app.routes.analytics import router as analytics_router

app = FastAPI(
    title="FactoryMind AI API",
    description="Industrial Digital Twin & Autonomous Maintenance Engine for JARVIS SI-02",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(dataset_router)
app.include_router(analytics_router)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Shared State ─────────────────────────────────────────────────────────────
state_lock = threading.RLock()

# Initial machine baseline configurations with industrial sensor telemetry
BASE_MACHINES: List[Dict[str, Any]] = [
    {
        "id": "M1",
        "name": "Cutting",
        "processing_time": 3.0,
        "status": "running",
        "queue": 4,
        "utilization": 72.0,
        "completed": 0,
        "downtime": 0,
        "temperature": 48.2,
        "vibration": 1.82,
        "rpm": 1450,
        "power": 6.2,
        "pressure": 6.0,
        "health": 97,
        "isolated": False,
        "isolation_reason": None,
    },
    {
        "id": "M2",
        "name": "Drilling",
        "processing_time": 4.0,
        "status": "running",
        "queue": 7,
        "utilization": 81.0,
        "completed": 0,
        "downtime": 0,
        "temperature": 52.4,
        "vibration": 2.15,
        "rpm": 1420,
        "power": 7.4,
        "pressure": 6.1,
        "health": 95,
        "isolated": False,
        "isolation_reason": None,
    },
    {
        "id": "M3",
        "name": "Assembly",
        "processing_time": 8.0,
        "status": "running",
        "queue": 12,
        "utilization": 96.0,
        "completed": 0,
        "downtime": 0,
        "temperature": 44.1,
        "vibration": 1.38,
        "rpm": 1380,
        "power": 5.8,
        "pressure": 5.9,
        "health": 96,
        "isolated": False,
        "isolation_reason": None,
    },
    {
        "id": "M4",
        "name": "Quality Check",
        "processing_time": 5.0,
        "status": "running",
        "queue": 3,
        "utilization": 65.0,
        "completed": 0,
        "downtime": 0,
        "temperature": 38.0,
        "vibration": 0.85,
        "rpm": 1200,
        "power": 3.2,
        "pressure": 5.5,
        "health": 99,
        "isolated": False,
        "isolation_reason": None,
    },
    {
        "id": "M5",
        "name": "Packaging",
        "processing_time": 3.5,
        "status": "running",
        "queue": 2,
        "utilization": 58.0,
        "completed": 0,
        "downtime": 0,
        "temperature": 41.6,
        "vibration": 1.55,
        "rpm": 1310,
        "power": 4.5,
        "pressure": 5.8,
        "health": 98,
        "isolated": False,
        "isolation_reason": None,
    },
]

machines: List[Dict[str, Any]] = [dict(m) for m in BASE_MACHINES]
factory_running = True
total_production = 0
total_downtime = 0
event_log: List[Dict[str, Any]] = []

# ─── Autonomous AI Diagnostic State ───────────────────────────────────────────
ai_diagnosis: Dict[str, Any] = {
    "active": False,
    "phase": "IDLE",  # IDLE, ANALYZING_SENSORS, CORRELATING_PARAMETERS, ROOT_CAUSE_IDENTIFIED
    "machine_id": None,
    "root_cause": None,
    "confidence": 0,
    "impact_production_pct": 0,
    "affected_stage": None,
    "downstream_impact": None,
    "recommended_action": None,
    "timestamp": None,
}

# ─── Autonomous Maintenance & Repair State ────────────────────────────────────
repair_status: Dict[str, Any] = {
    "active": False,
    "target_machine": None,
    "progress": 0,
    "current_task": None,
    "tasks": [
        {"name": "Component inspection", "progress": 0, "status": "pending"},
        {"name": "Lubrication check", "progress": 0, "status": "pending"},
        {"name": "Spindle calibration", "progress": 0, "status": "pending"},
        {"name": "Sensor verification", "progress": 0, "status": "pending"},
    ],
    "validation_results": {
        "temperature": "PENDING",
        "vibration": "PENDING",
        "rpm": "PENDING",
        "power": "PENDING",
        "cycle_time": "PENDING",
    },
    "service_robot_position": [0, 0, 0],
}

# ─── Anomaly Alerts ───────────────────────────────────────────────────────────
active_alerts: List[Dict[str, Any]] = []

# ─── Demo Mode Controller ─────────────────────────────────────────────────────
demo_mode = False
demo_phase = "idle"  # idle, normal, drift, anomaly, diagnosis, isolated, repairing, testing, recovered
demo_thread: Optional[threading.Thread] = None
demo_stop_event = threading.Event()


# ─── Bottleneck Calculation ───────────────────────────────────────────────────
def calculate_bottleneck() -> Optional[Dict[str, Any]]:
    active = [m for m in machines if m["status"] not in ("offline", "malfunction") and not m.get("isolated")]
    if not active:
        return None
    item = max(active, key=lambda m: m["utilization"] * 0.55 + m["queue"] * 2.5 + m["processing_time"] * 3)
    score = round(item["utilization"] * 0.55 + item["queue"] * 2.5 + item["processing_time"] * 3, 2)
    return {
        "machine_id": item["id"],
        "machine_name": item["name"],
        "score": score,
        "severity": "critical" if item["utilization"] >= 90 else "warning" if item["utilization"] >= 75 else "normal",
        "reason": f"Utilization {item['utilization']:.1f}%, queue {item['queue']} parts, processing time {item['processing_time']} sec",
        "recommended_action": f"Reduce {item['name']} processing time or add parallel capacity.",
    }


# ─── Factory Health Score ──────────────────────────────────────────────────────
def calculate_factory_health() -> int:
    with state_lock:
        if not machines:
            return 100
        avg_mach_health = sum(m.get("health", 95) for m in machines) / len(machines)
        isolated_or_failed = sum(1 for m in machines if m["status"] in ("offline", "malfunction") or m.get("isolated"))
        anomaly_count = sum(1 for m in machines if m["status"] in ("anomaly", "warning", "diagnosing"))
        
        penalty = (isolated_or_failed * 35) + (anomaly_count * 15)
        score = int(avg_mach_health - penalty)
        return max(15, min(100, score))


# ─── Simulation Loop ──────────────────────────────────────────────────────────
def simulation_loop():
    global total_production, total_downtime
    while True:
        time.sleep(1)
        with state_lock:
            if not factory_running:
                continue

            has_offline = any(m["status"] in ("offline", "malfunction") or m.get("isolated") for m in machines)

            for i, m in enumerate(machines):
                is_down = m["status"] in ("offline", "malfunction") or m.get("isolated")

                if is_down:
                    m["downtime"] += 1
                    total_downtime += 1
                    m["health"] = max(25, m["health"] - 1)
                    # Upstream buffer queues up
                    if i > 0:
                        machines[i - 1]["queue"] = min(35, machines[i - 1]["queue"] + random.choice([0, 1]))
                    # Downstream machine utilization drops
                    if i < len(machines) - 1:
                        machines[i + 1]["utilization"] = max(15.0, machines[i + 1]["utilization"] - 1.5)
                        if machines[i + 1]["queue"] > 0 and random.random() < 0.3:
                            machines[i + 1]["queue"] -= 1
                    continue

                # Healthy / operating machine micro-fluctuations
                status = m["status"]
                if status == "running":
                    m["utilization"] = max(25.0, min(98.5, m["utilization"] + random.uniform(-1.5, 1.5)))
                    m["temperature"] = round(max(35.0, min(65.0, m["temperature"] + random.uniform(-0.3, 0.3))), 1)
                    m["vibration"] = round(max(0.6, min(2.8, m["vibration"] + random.uniform(-0.06, 0.06))), 2)
                    m["rpm"] = int(max(1300, min(1550, m["rpm"] + random.randint(-8, 8))))
                    m["power"] = round(max(3.0, min(9.0, m["power"] + random.uniform(-0.1, 0.1))), 1)
                    m["health"] = min(100, max(92, m["health"] + random.choice([0, 1])))

                    if random.random() < 0.45:
                        m["queue"] = max(1, min(15, m["queue"] + random.randint(-1, 1)))
                    if random.random() < 0.4 and m["queue"] > 0:
                        m["queue"] = max(0, m["queue"] - 1)
                        m["completed"] += 1

                elif status == "warning":
                    m["utilization"] = min(95.0, m["utilization"] + 0.5)
                    m["temperature"] = round(min(74.0, m["temperature"] + 0.4), 1)
                    m["vibration"] = round(min(4.8, m["vibration"] + 0.1), 2)
                    m["health"] = max(65, m["health"] - 1)

                elif status == "anomaly":
                    m["utilization"] = min(99.0, m["utilization"] + 1.0)
                    m["temperature"] = round(min(88.0, m["temperature"] + 0.8), 1)
                    m["vibration"] = round(min(9.2, m["vibration"] + 0.25), 2)
                    m["rpm"] = max(1150, m["rpm"] - 15)
                    m["power"] = round(min(10.5, m["power"] + 0.3), 1)
                    m["health"] = max(40, m["health"] - 2)

                elif status == "repairing":
                    m["temperature"] = round(max(45.0, m["temperature"] - 0.6), 1)
                    m["vibration"] = round(max(1.5, m["vibration"] - 0.15), 2)
                    m["rpm"] = min(1420, m["rpm"] + 10)
                    m["power"] = round(max(6.0, m["power"] - 0.15), 1)
                    m["health"] = min(90, m["health"] + 2)

                elif status == "testing":
                    m["temperature"] = round(max(50.0, m["temperature"] - 0.4), 1)
                    m["vibration"] = round(max(1.8, m["vibration"] - 0.1), 2)
                    m["rpm"] = 1420
                    m["power"] = 7.2
                    m["health"] = min(96, m["health"] + 2)

                elif status == "recovered":
                    m["status"] = "running"
                    m["health"] = 96
                    m["isolated"] = False
                    m["isolation_reason"] = None

            # Production throughput
            if not has_offline:
                total_production += random.randint(1, 3)
            else:
                if random.random() < 0.25:
                    total_production += 1


# ─── DB Writer Thread ─────────────────────────────────────────────────────────
def db_writer_loop():
    while True:
        time.sleep(5)
        try:
            with state_lock:
                snapshot = [dict(m) for m in machines]
                bn = calculate_bottleneck()

            db = SessionLocal()
            try:
                for m in snapshot:
                    machine_row = db.query(Machine).filter(Machine.machine_code == m["id"]).first()
                    if machine_row:
                        machine_row.status = m["status"]
                        machine_row.processing_time = m["processing_time"]

                    record = ProductionRecord(
                        machine_code=m["id"],
                        production_count=m["completed"],
                        queue_size=m["queue"],
                        utilization=round(m["utilization"], 2),
                        downtime=m["downtime"],
                    )
                    db.add(record)

                if bn:
                    bn_machine = next((m for m in snapshot if m["id"] == bn["machine_id"]), None)
                    if bn_machine:
                        db.add(BottleneckRecord(
                            machine_code=bn["machine_id"],
                            utilization=round(bn_machine["utilization"], 2),
                            queue_size=bn_machine["queue"],
                            recommendation=bn["recommended_action"],
                        ))

                db.commit()
            except Exception as exc:
                db.rollback()
                print(f"[DB writer] commit error: {exc}")
            finally:
                db.close()
        except Exception as exc:
            print(f"[DB writer] unexpected error: {exc}")


# ─── Autonomous Demo Sequencer ─────────────────────────────────────────────────
def run_autonomous_demo():
    """
    Orchestrates the complete autonomous smart factory lifecycle demo:
    0–10s: Normal factory operation
    10–15s: M2 sensor values begin drifting
    15–20s: Anomaly detected
    20–25s: AI diagnosis
    25–30s: M2 automatically isolated
    30–45s: Autonomous repair executing
    45–55s: System testing & validation
    55–60s: M2 recovered
    60s+: Production normalized
    """
    global demo_mode, demo_phase, ai_diagnosis, repair_status, factory_running

    def wait_interruptible(seconds: float) -> bool:
        """Returns True if stopped early."""
        return demo_stop_event.wait(seconds)

    try:
        # Step 1: Normal production (0-8s)
        demo_phase = "normal"
        with state_lock:
            event_log.append({
                "type": "demo_phase",
                "phase": "NORMAL PRODUCTION",
                "message": "Autonomous Factory Monitoring active — all 5 stages nominal",
                "timestamp": now(),
            })
        if wait_interruptible(8.0):
            return

        # Step 2: Sensor drift on M2 (8-14s)
        demo_phase = "drift"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "warning"
                m2["temperature"] = 72.5
                m2["vibration"] = 5.2
                m2["rpm"] = 1340
                m2["power"] = 8.6
                m2["health"] = 78
                m2["queue"] = 12
            event_log.append({
                "type": "demo_phase",
                "machine_id": "M2",
                "phase": "SENSOR DRIFT",
                "message": "M2 Drilling telemetry drifting: Vib 5.2 mm/s, Temp 72.5°C",
                "timestamp": now(),
            })
        if wait_interruptible(6.0):
            return

        # Step 3: Anomaly Detected (14-20s)
        demo_phase = "anomaly"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "anomaly"
                m2["temperature"] = 87.4
                m2["vibration"] = 8.72
                m2["rpm"] = 1180
                m2["power"] = 9.8
                m2["health"] = 42
                m2["queue"] = 19
            active_alerts.append({
                "machine": "M2 — Drilling",
                "severity": "CRITICAL",
                "title": "ANOMALY DETECTED",
                "details": "Vibration 8.7 mm/s (norm <5.0) | Temp 87°C (norm <75°C) | Cycle 6.8s",
                "timestamp": now(),
            })
            event_log.append({
                "type": "anomaly_detected",
                "machine_id": "M2",
                "phase": "ANOMALY DETECTED",
                "message": "CRITICAL ANOMALY: M2 multi-parameter threshold violation detected",
                "timestamp": now(),
            })
        if wait_interruptible(6.0):
            return

        # Step 4: AI Diagnosis (20-25s)
        demo_phase = "diagnosis"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "diagnosing"
            ai_diagnosis.update({
                "active": True,
                "phase": "ROOT_CAUSE_IDENTIFIED",
                "machine_id": "M2",
                "root_cause": "Drilling spindle overheating and abnormal bearing vibration harmonics.",
                "confidence": 94,
                "impact_production_pct": -18,
                "affected_stage": "M2 — Drilling",
                "downstream_impact": "M3 Assembly queue starving; upstream cutting buffer critical.",
                "recommended_action": "Execute automated safety isolation and initiate autonomous calibration sequence.",
                "timestamp": now(),
            })
            event_log.append({
                "type": "ai_diagnosis",
                "machine_id": "M2",
                "phase": "AI DIAGNOSIS",
                "message": "AI Diagnostic Engine: Spindle bearing thermal runaway identified (94% confidence)",
                "timestamp": now(),
            })
        if wait_interruptible(5.0):
            return

        # Step 5: Machine Automatically Isolated (25-30s)
        demo_phase = "isolated"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "malfunction"
                m2["isolated"] = True
                m2["isolation_reason"] = "Critical vibration (8.7 mm/s) + overheating (87°C) detected"
                m2["queue"] = 24
            event_log.append({
                "type": "machine_isolated",
                "machine_id": "M2",
                "phase": "AUTOMATIC SAFETY ISOLATION",
                "message": "AUTOMATIC SAFETY ISOLATION ACTIVE: M2 decoupled from live line",
                "timestamp": now(),
            })

            # Record failure in database
            try:
                db = SessionLocal()
                db.add(FailureRecord(machine_code="M2", failure_type="spindle_thermal_vibration", downtime=0))
                db.commit()
                db.close()
            except Exception:
                pass

        if wait_interruptible(5.0):
            return

        # Step 6: Autonomous Repair Starts (30-45s)
        demo_phase = "repairing"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "repairing"
            repair_status.update({
                "active": True,
                "target_machine": "M2",
                "progress": 5,
                "current_task": "Component inspection",
                "tasks": [
                    {"name": "Component inspection", "progress": 25, "status": "in_progress"},
                    {"name": "Lubrication check", "progress": 0, "status": "pending"},
                    {"name": "Spindle calibration", "progress": 0, "status": "pending"},
                    {"name": "Sensor verification", "progress": 0, "status": "pending"},
                ],
                "validation_results": {
                    "temperature": "CHECKING",
                    "vibration": "CHECKING",
                    "rpm": "CHECKING",
                    "power": "CHECKING",
                    "cycle_time": "CHECKING",
                },
                "service_robot_position": [-4, 0, 1.8],
            })
            event_log.append({
                "type": "repair_started",
                "machine_id": "M2",
                "phase": "AUTONOMOUS REPAIR",
                "message": "Autonomous Maintenance Unit dispatched to M2 Drilling station",
                "timestamp": now(),
            })

        # Repair progress increments over 15 seconds
        for step_idx, task_name in enumerate(["Component inspection", "Lubrication check", "Spindle calibration", "Sensor verification"]):
            if wait_interruptible(3.2):
                return
            with state_lock:
                pct = int((step_idx + 1) * 25)
                repair_status["progress"] = pct
                repair_status["current_task"] = task_name
                repair_status["tasks"][step_idx]["progress"] = 100
                repair_status["tasks"][step_idx]["status"] = "completed"
                if step_idx < 3:
                    repair_status["tasks"][step_idx + 1]["status"] = "in_progress"

                # Progressive machine cooldown
                m2 = next((m for m in machines if m["id"] == "M2"), None)
                if m2:
                    m2["temperature"] = max(55.0, m2["temperature"] - 7.5)
                    m2["vibration"] = max(2.8, m2["vibration"] - 1.4)
                    m2["health"] = min(88, m2["health"] + 11)

                event_log.append({
                    "type": "repair_progress",
                    "machine_id": "M2",
                    "message": f"Maintenance task '{task_name}' completed — progress {pct}%",
                    "timestamp": now(),
                })

        # Step 7: System Validation and Testing (45-55s)
        demo_phase = "testing"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "testing"
                m2["temperature"] = 53.0
                m2["vibration"] = 2.18
                m2["rpm"] = 1420
                m2["power"] = 7.3
                m2["health"] = 96
            repair_status["validation_results"] = {
                "temperature": "NORMAL (53°C)",
                "vibration": "NORMAL (2.18 mm/s)",
                "rpm": "NORMAL (1420 RPM)",
                "power": "NORMAL (7.3 kW)",
                "cycle_time": "NORMAL (4.0s)",
            }
            event_log.append({
                "type": "system_check",
                "machine_id": "M2",
                "phase": "SYSTEM HEALTH CHECK",
                "message": "Automated validation complete: All M2 sensor parameters verified NORMAL",
                "timestamp": now(),
            })
        if wait_interruptible(7.0):
            return

        # Step 8: Machine Restored (55-60s)
        demo_phase = "recovered"
        with state_lock:
            m2 = next((m for m in machines if m["id"] == "M2"), None)
            if m2:
                m2["status"] = "recovered"
                m2["isolated"] = False
                m2["isolation_reason"] = None
                m2["queue"] = 7
                m2["health"] = 97
            repair_status["active"] = False
            ai_diagnosis["active"] = False
            active_alerts.clear()
            event_log.append({
                "type": "machine_restored",
                "machine_id": "M2",
                "phase": "MACHINE RESTORED",
                "message": "M2 Drilling restored to line — production flow normalized",
                "timestamp": now(),
            })
        if wait_interruptible(4.0):
            return

        # Step 9: Normalized production (60s+)
        demo_phase = "normal"
        with state_lock:
            for m in machines:
                m["status"] = "running"
                m["isolated"] = False
            demo_mode = False
            event_log.append({
                "type": "demo_completed",
                "phase": "COMPLETE",
                "message": "Autonomous Factory Demo lifecycle completed successfully",
                "timestamp": now(),
            })

    except Exception as exc:
        print(f"[Demo error]: {exc}")
    finally:
        demo_mode = False


# ─── Startup Event ────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    """Initializes tables, seeds machines into database, and starts background threads."""
    init_db()

    db = SessionLocal()
    try:
        for m in machines:
            existing = db.query(Machine).filter(Machine.machine_code == m["id"]).first()
            if existing is None:
                db.add(Machine(
                    machine_code=m["id"],
                    name=m["name"],
                    processing_time=m["processing_time"],
                    status=m["status"],
                ))
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[startup] machine seed error: {exc}")
    finally:
        db.close()

    threading.Thread(target=simulation_loop, daemon=True).start()
    threading.Thread(target=db_writer_loop, daemon=True).start()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"project": "FactoryMind AI", "status": "online", "version": "0.3.0"}


@app.get("/api/health")
def health():
    return {"status": "healthy", "timestamp": now()}


@app.get("/api/factory/state")
def get_factory_state():
    with state_lock:
        active_count = sum(1 for m in machines if m["status"] not in ("offline", "malfunction") and not m.get("isolated"))
        avg_util = sum(m["utilization"] for m in machines) / len(machines)
        rate = round(sum(m["completed"] for m in machines) / max(1, total_production + 1) * 60, 1)

        return {
            "factory_running": factory_running,
            "timestamp": now(),
            "total_production": total_production,
            "total_downtime": total_downtime,
            "average_utilization": round(avg_util, 2),
            "production_rate": rate if rate > 0 else 42.0,
            "bottleneck": calculate_bottleneck(),
            "machines": [dict(m) for m in machines],
            "event_log": event_log[-20:],
            "demo_mode": demo_mode,
            "demo_phase": demo_phase,
            "active_machines": active_count,
            "factory_health": calculate_factory_health(),
            "ai_diagnosis": dict(ai_diagnosis),
            "repair_status": dict(repair_status),
            "active_alerts": list(active_alerts),
        }


@app.post("/api/factory/start")
def start_factory():
    global factory_running
    with state_lock:
        factory_running = True
        event_log.append({"type": "factory_started", "message": "Factory simulation started", "timestamp": now()})
    return {"success": True, "message": "Factory started"}


@app.post("/api/factory/stop")
def stop_factory():
    global factory_running
    with state_lock:
        factory_running = False
        event_log.append({"type": "factory_stopped", "message": "Factory simulation paused", "timestamp": now()})
    return {"success": True, "message": "Factory paused"}


@app.post("/api/factory/reset")
def reset_factory():
    global total_production, total_downtime, factory_running, demo_mode, demo_phase
    # Cancel running demo if active
    demo_stop_event.set()
    demo_mode = False
    demo_phase = "idle"

    with state_lock:
        total_production = 0
        total_downtime = 0
        factory_running = True
        for i, m in enumerate(machines):
            m.clear()
            m.update(dict(BASE_MACHINES[i]))
        event_log.clear()
        active_alerts.clear()
        ai_diagnosis.update({
            "active": False,
            "phase": "IDLE",
            "machine_id": None,
            "root_cause": None,
            "confidence": 0,
            "impact_production_pct": 0,
            "affected_stage": None,
            "downstream_impact": None,
            "recommended_action": None,
            "timestamp": None,
        })
        repair_status.update({
            "active": False,
            "target_machine": None,
            "progress": 0,
            "current_task": None,
            "tasks": [
                {"name": "Component inspection", "progress": 0, "status": "pending"},
                {"name": "Lubrication check", "progress": 0, "status": "pending"},
                {"name": "Spindle calibration", "progress": 0, "status": "pending"},
                {"name": "Sensor verification", "progress": 0, "status": "pending"},
            ],
            "validation_results": {
                "temperature": "PENDING",
                "vibration": "PENDING",
                "rpm": "PENDING",
                "power": "PENDING",
                "cycle_time": "PENDING",
            },
        })
        event_log.append({"type": "factory_reset", "message": "Factory state reset to initial baseline", "timestamp": now()})
    return {"success": True, "message": "Factory reset"}


class MachineSpeedRequest(BaseModel):
    processing_time: float


@app.post("/api/factory/machine/{machine_id}/speed")
def update_machine_speed(machine_id: str, req: MachineSpeedRequest):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        if req.processing_time <= 0 or req.processing_time > 60:
            raise HTTPException(status_code=400, detail="Processing time must be between 0.5s and 60.0s")
        m["processing_time"] = round(float(req.processing_time), 1)
        event_log.append({
            "type": "speed_updated",
            "machine_id": m["id"],
            "message": f"{m['name']} cycle time set to {m['processing_time']}s",
            "timestamp": now(),
        })
        return {"success": True, "message": f"{m['name']} cycle time set to {m['processing_time']}s", "bottleneck": calculate_bottleneck()}


@app.post("/api/factory/failure/{machine_id}")
@app.post("/api/factory/machine/{machine_id}/fail")
def trigger_machine_failure(machine_id: str):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        m["status"] = "offline"
        m["isolated"] = True
        m["isolation_reason"] = "Machine offline / emergency stop"
        m["health"] = 38
        event_log.append({
            "type": "machine_failure",
            "machine_id": m["id"],
            "message": f"{m['name']} is offline — safety isolation active",
            "timestamp": now(),
        })
        active_alerts.append({
            "machine": f"{m['id']} — {m['name']}",
            "severity": "CRITICAL",
            "title": "MACHINE MALFUNCTION",
            "details": f"{m['name']} is offline",
            "timestamp": now(),
        })
        snap = dict(m)

    try:
        db = SessionLocal()
        db.add(FailureRecord(machine_code=snap["id"], failure_type="manual_fault", downtime=snap["downtime"]))
        db.commit()
        db.close()
    except Exception:
        pass

    return {"success": True, "message": f"{snap['name']} is offline", "bottleneck": calculate_bottleneck()}


@app.post("/api/factory/recover/{machine_id}")
@app.post("/api/factory/machine/{machine_id}/recover")
def recover_machine(machine_id: str):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        m["status"] = "running"
        m["isolated"] = False
        m["isolation_reason"] = None
        m["health"] = 96
        # Clear alerts for this machine
        active_alerts[:] = [a for a in active_alerts if m["id"] not in a.get("machine", "")]
        event_log.append({
            "type": "machine_recovered",
            "machine_id": m["id"],
            "message": f"{m['name']} recovered — nominal production resumed",
            "timestamp": now(),
        })
        return {"success": True, "message": f"{m['name']} recovered"}


@app.post("/api/factory/machine/{machine_id}/isolate")
def isolate_machine(machine_id: str):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        m["isolated"] = True
        m["status"] = "malfunction" if m["status"] not in ("offline", "malfunction") else m["status"]
        m["isolation_reason"] = "Safety isolation barrier deployed"
        event_log.append({
            "type": "machine_isolated",
            "machine_id": m["id"],
            "message": f"Safety boundary deployed around {m['name']}",
            "timestamp": now(),
        })
        return {"success": True, "message": f"{m['name']} isolated"}


@app.post("/api/factory/simulate/bottleneck")
def simulate_bottleneck():
    with state_lock:
        target = max(
            (m for m in machines if m["status"] not in ("offline", "malfunction") and not m.get("isolated")),
            key=lambda m: m["queue"],
            default=None,
        )
        if not target:
            raise HTTPException(status_code=400, detail="No active machines to stress")
        target["queue"] = max(target["queue"], 25)
        target["utilization"] = min(99.0, target["utilization"] + 20.0)
        event_log.append({
            "type": "bottleneck_simulated",
            "machine_id": target["id"],
            "message": f"Bottleneck simulated on {target['name']}",
            "timestamp": now(),
        })
        return {"success": True, "message": f"Bottleneck simulated on {target['name']}", "bottleneck": calculate_bottleneck()}


# ─── Demo Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/factory/demo/start")
def start_demo():
    global demo_mode, demo_thread, factory_running
    with state_lock:
        if demo_mode:
            return {"success": True, "message": "Demo already running"}
        demo_mode = True
        factory_running = True
        demo_stop_event.clear()
        event_log.append({
            "type": "demo_started",
            "message": "START AUTONOMOUS FACTORY DEMO: Presentation lifecycle initiated",
            "timestamp": now(),
        })

    demo_thread = threading.Thread(target=run_autonomous_demo, daemon=True)
    demo_thread.start()
    return {"success": True, "message": "Autonomous demo lifecycle started"}


@app.post("/api/factory/demo/stop")
def stop_demo():
    global demo_mode, demo_phase
    demo_stop_event.set()
    with state_lock:
        demo_mode = False
        demo_phase = "idle"
        event_log.append({
            "type": "demo_stopped",
            "message": "Autonomous Factory Demo halted",
            "timestamp": now(),
        })
    return {"success": True, "message": "Demo stopped"}


@app.post("/api/factory/demo/reset")
def reset_demo():
    return reset_factory()


@app.post("/api/factory/demo/skip-failure")
def skip_to_failure():
    """Immediately skips demo timeline directly to M2 Anomaly / Malfunction and Diagnosis."""
    with state_lock:
        m2 = next((m for m in machines if m["id"] == "M2"), None)
        if m2:
            m2["status"] = "malfunction"
            m2["isolated"] = True
            m2["isolation_reason"] = "Spindle thermal runaway (87°C) & severe vibration (8.7 mm/s)"
            m2["temperature"] = 87.4
            m2["vibration"] = 8.72
            m2["rpm"] = 1180
            m2["power"] = 9.8
            m2["health"] = 42
            m2["queue"] = 24

        ai_diagnosis.update({
            "active": True,
            "phase": "ROOT_CAUSE_IDENTIFIED",
            "machine_id": "M2",
            "root_cause": "Drilling spindle overheating and abnormal bearing vibration harmonics.",
            "confidence": 94,
            "impact_production_pct": -18,
            "affected_stage": "M2 — Drilling",
            "downstream_impact": "M3 Assembly queue starving; upstream cutting buffer critical.",
            "recommended_action": "Execute automated safety isolation and initiate autonomous calibration sequence.",
            "timestamp": now(),
        })
        active_alerts.clear()
        active_alerts.append({
            "machine": "M2 — Drilling",
            "severity": "CRITICAL",
            "title": "AUTOMATIC SAFETY ISOLATION ACTIVE",
            "details": "Critical vibration + overheating detected. Decoupled from production line.",
            "timestamp": now(),
        })
        event_log.append({
            "type": "skip_failure",
            "machine_id": "M2",
            "message": "[DEMO ACTION] Skipped directly to M2 Malfunction & Safety Isolation",
            "timestamp": now(),
        })
    return {"success": True, "message": "Skipped to malfunction and isolation"}


@app.post("/api/factory/demo/skip-repair")
def skip_to_repair():
    """Immediately launches autonomous maintenance on M2."""
    with state_lock:
        m2 = next((m for m in machines if m["id"] == "M2"), None)
        if m2:
            m2["status"] = "repairing"
            m2["isolated"] = True
            m2["temperature"] = 62.0
            m2["vibration"] = 3.5
            m2["health"] = 72

        repair_status.update({
            "active": True,
            "target_machine": "M2",
            "progress": 65,
            "current_task": "Spindle calibration",
            "tasks": [
                {"name": "Component inspection", "progress": 100, "status": "completed"},
                {"name": "Lubrication check", "progress": 100, "status": "completed"},
                {"name": "Spindle calibration", "progress": 65, "status": "in_progress"},
                {"name": "Sensor verification", "progress": 30, "status": "pending"},
            ],
            "validation_results": {
                "temperature": "CALIBRATING",
                "vibration": "CALIBRATING",
                "rpm": "TESTING",
                "power": "CHECKING",
                "cycle_time": "PENDING",
            },
            "service_robot_position": [-4, 0, 1.8],
        })
        event_log.append({
            "type": "skip_repair",
            "machine_id": "M2",
            "message": "[DEMO ACTION] Skipped directly to Autonomous Maintenance & Calibration",
            "timestamp": now(),
        })
    return {"success": True, "message": "Skipped to autonomous repair"}
