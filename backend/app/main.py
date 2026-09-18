"""
main.py — FactoryMind AI FastAPI application entry point.

Preserves all existing factory simulation endpoints and logic.
Adds SQLite/SQLAlchemy database integration:
  - Tables created only if they do not exist
  - Machines table seeded from in-memory list on startup
  - Background DB writer thread persists state every 5 seconds
  - Failure events are recorded immediately to failure_records table
"""

from datetime import datetime, timezone
import random
import threading
import time
from typing import Dict, List, Optional

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
    description="Industrial Digital Twin & Bottleneck Intelligence Engine for JARVIS SI-02",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount new routers
app.include_router(dataset_router)
app.include_router(analytics_router)

# ─── Shared in-memory simulation state ────────────────────────────────────────
state_lock = threading.Lock()

machines = [
    {"id": "M1", "name": "Cutting",      "processing_time": 3.0, "status": "running", "queue": 4,  "utilization": 72.0, "completed": 0, "downtime": 0},
    {"id": "M2", "name": "Drilling",     "processing_time": 4.0, "status": "running", "queue": 7,  "utilization": 81.0, "completed": 0, "downtime": 0},
    {"id": "M3", "name": "Assembly",     "processing_time": 8.0, "status": "running", "queue": 12, "utilization": 96.0, "completed": 0, "downtime": 0},
    {"id": "M4", "name": "Quality Check","processing_time": 5.0, "status": "running", "queue": 3,  "utilization": 65.0, "completed": 0, "downtime": 0},
    {"id": "M5", "name": "Packaging",    "processing_time": 3.5, "status": "running", "queue": 2,  "utilization": 58.0, "completed": 0, "downtime": 0},
]
factory_running = True
total_production = 0
total_downtime = 0
event_log: List[dict] = []

# ─── Demo mode state ──────────────────────────────────────────────────────────
demo_mode = False
_demo_timer: Optional[threading.Timer] = None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def bottleneck() -> Optional[dict]:
    active = [m for m in machines if m["status"] != "offline"]
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


# ─── Simulation loop ──────────────────────────────────────────────────────────
def loop():
    global total_production, total_downtime
    while True:
        time.sleep(1)
        with state_lock:
            if not factory_running:
                continue
            has_offline = any(m["status"] == "offline" for m in machines)
            for i, m in enumerate(machines):
                if m["status"] == "offline":
                    m["downtime"] += 1
                    total_downtime += 1
                    if i > 0:
                        machines[i - 1]["queue"] += 1
                    if i < len(machines) - 1:
                        machines[i + 1]["utilization"] = max(10, machines[i + 1]["utilization"] - 2)
                    continue
                m["utilization"] = max(20.0, min(99.0, m["utilization"] + random.uniform(-2.5, 2.5)))
                if random.random() < 0.45:
                    m["queue"] += random.randint(0, 2)
                if random.random() < 0.4 and m["queue"] > 0:
                    m["queue"] -= 1
                    m["completed"] += 1
            # When a machine fails, output drops significantly
            if not has_offline:
                total_production += random.randint(0, 2)
            else:
                if random.random() < 0.2:
                    total_production += 1


# ─── DB writer thread: persists state every 5 seconds ─────────────────────────
def db_writer():
    """
    Runs in a background daemon thread.
    Every 5 seconds, takes a snapshot of the current in-memory simulation state
    and persists it to the SQLite database.  This avoids creating duplicate records
    on every frontend poll request.
    """
    while True:
        time.sleep(5)
        try:
            with state_lock:
                snapshot = [dict(m) for m in machines]
                current_total = total_production

            db = SessionLocal()
            try:
                # ── Update machine status in the machines table ──────────────
                for m in snapshot:
                    machine_row = db.query(Machine).filter(Machine.machine_code == m["id"]).first()
                    if machine_row:
                        machine_row.status = m["status"]
                        machine_row.processing_time = m["processing_time"]

                # ── Insert per-machine production records ────────────────────
                for m in snapshot:
                    record = ProductionRecord(
                        machine_code=m["id"],
                        production_count=m["completed"],
                        queue_size=m["queue"],
                        utilization=round(m["utilization"], 2),
                        downtime=m["downtime"],
                    )
                    db.add(record)

                # ── Insert bottleneck record (computed from current snapshot) ─
                with state_lock:
                    bn = bottleneck()
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


# ─── Startup: init DB tables and seed machines ─────────────────────────────────
@app.on_event("startup")
def startup_event():
    """
    Called once when the server starts.
    - Creates all tables if they do not already exist (safe, idempotent).
    - Upserts the five machine definitions into the machines table.
    - Starts the background simulation loop and DB writer threads.
    """
    init_db()  # CREATE TABLE IF NOT EXISTS for all models

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

    threading.Thread(target=loop, daemon=True).start()
    threading.Thread(target=db_writer, daemon=True).start()


# ─── Existing endpoints (preserved exactly) ───────────────────────────────────

@app.get("/")
def root():
    return {"project": "FactoryMind AI", "status": "online"}


@app.get("/api/health")
def health():
    return {"status": "healthy", "timestamp": now()}


@app.get("/api/factory/state")
def state():
    with state_lock:
        avg = sum(m["utilization"] for m in machines) / len(machines)
        active_count = sum(1 for m in machines if m["status"] != "offline")
        return {
            "factory_running": factory_running,
            "timestamp": now(),
            "total_production": total_production,
            "total_downtime": total_downtime,
            "average_utilization": round(avg, 2),
            "production_rate": round(total_production, 2),
            "bottleneck": bottleneck(),
            "machines": machines,
            "event_log": event_log[-10:],
            "demo_mode": demo_mode,
            "active_machines": active_count,
        }


@app.post("/api/factory/start")
def start():
    global factory_running
    with state_lock:
        factory_running = True
        event_log.append({"type": "factory_started", "message": "Factory simulation started", "timestamp": now()})
    return {"success": True}


@app.post("/api/factory/stop")
def stop():
    global factory_running
    with state_lock:
        factory_running = False
        event_log.append({"type": "factory_stopped", "message": "Factory simulation stopped", "timestamp": now()})
    return {"success": True}


@app.post("/api/factory/reset")
def reset():
    global total_production, total_downtime, factory_running
    with state_lock:
        total_production = 0
        total_downtime = 0
        factory_running = True
        defaults = [4, 7, 12, 3, 2]
        utils = [72, 81, 96, 65, 58]
        for i, m in enumerate(machines):
            m.update(status="running", queue=defaults[i], utilization=utils[i], completed=0, downtime=0)
        event_log.clear()
        event_log.append({"type": "factory_reset", "message": "Factory simulation reset to initial state", "timestamp": now()})
    return {"success": True}


class MachineSpeedRequest(BaseModel):
    processing_time: float


@app.post("/api/factory/failure/{machine_id}")
def failure(machine_id: str):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        m["status"] = "offline"
        event_log.append({
            "type": "machine_failure",
            "machine_id": m["id"],
            "message": f"{m['name']} failure detected",
            "timestamp": now(),
        })
        machine_snapshot = dict(m)

    # Persist failure event to DB (outside lock)
    try:
        db = SessionLocal()
        try:
            db.add(FailureRecord(
                machine_code=machine_snapshot["id"],
                failure_type="unplanned",
                downtime=machine_snapshot["downtime"],
            ))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[failure endpoint] DB write error: {exc}")
        finally:
            db.close()
    except Exception as exc:
        print(f"[failure endpoint] session error: {exc}")

    with state_lock:
        return {"success": True, "message": f"{machine_snapshot['name']} is offline", "bottleneck": bottleneck()}


@app.post("/api/factory/recover/{machine_id}")
def recover(machine_id: str):
    with state_lock:
        m = next((x for x in machines if x["id"] == machine_id.upper()), None)
        if not m:
            raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
        m["status"] = "running"
        event_log.append({
            "type": "machine_recovered",
            "machine_id": m["id"],
            "message": f"{m['name']} recovered",
            "timestamp": now(),
        })
        return {"success": True, "message": f"{m['name']} recovered"}


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
        return {"success": True, "message": f"{m['name']} cycle time set to {m['processing_time']}s", "bottleneck": bottleneck()}


# ─── Simulate bottleneck endpoint ─────────────────────────────────────────────

@app.post("/api/factory/simulate/bottleneck")
def simulate_bottleneck():
    """Push the highest-queue machine into an obvious bottleneck state for demo purposes."""
    with state_lock:
        # Find the machine with the largest queue, prefer running machines
        target = max(
            (m for m in machines if m["status"] != "offline"),
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
        return {"success": True, "message": f"Bottleneck simulated on {target['name']}", "bottleneck": bottleneck()}


# ─── Demo mode endpoints ───────────────────────────────────────────────────────

def _demo_sequence_step2():
    """Second step of the demo: bump M3 (Assembly) into a severe bottleneck."""
    global _demo_timer
    with state_lock:
        m3 = next((m for m in machines if m["id"] == "M3"), None)
        if m3 and m3["status"] != "offline":
            m3["queue"] = max(m3["queue"], 28)
            m3["utilization"] = min(99.0, 97.0)
            event_log.append({
                "type": "demo_bottleneck",
                "machine_id": "M3",
                "message": "[DEMO] Assembly bottleneck triggered — queue critical",
                "timestamp": now(),
            })


def _demo_sequence_step1():
    """First step of the demo: start building up M2 (Drilling) queue."""
    global _demo_timer
    with state_lock:
        m2 = next((m for m in machines if m["id"] == "M2"), None)
        if m2 and m2["status"] != "offline":
            m2["queue"] = max(m2["queue"], 18)
            m2["utilization"] = min(99.0, m2["utilization"] + 12.0)
            event_log.append({
                "type": "demo_warning",
                "machine_id": "M2",
                "message": "[DEMO] Drilling queue building — approaching threshold",
                "timestamp": now(),
            })
    # Schedule step 2 in 12 seconds
    _demo_timer = threading.Timer(12.0, _demo_sequence_step2)
    _demo_timer.daemon = True
    _demo_timer.start()


@app.post("/api/factory/demo/start")
def demo_start():
    """Start the automated demo sequence."""
    global demo_mode, _demo_timer, factory_running  # all globals declared first
    with state_lock:
        if demo_mode:
            return {"success": True, "message": "Demo already running"}
        demo_mode = True
        needs_start = not factory_running
        if needs_start:
            factory_running = True
        event_log.append({
            "type": "demo_started",
            "message": "[DEMO] Presentation mode activated",
            "timestamp": now(),
        })
    # Schedule step 1 in 8 seconds
    _demo_timer = threading.Timer(8.0, _demo_sequence_step1)
    _demo_timer.daemon = True
    _demo_timer.start()
    return {"success": True, "message": "Demo sequence started — watch the dashboard"}



@app.post("/api/factory/demo/stop")
def demo_stop():
    """Stop the demo sequence and cancel any pending timers."""
    global demo_mode, _demo_timer
    if _demo_timer is not None:
        _demo_timer.cancel()
        _demo_timer = None
    with state_lock:
        demo_mode = False
        event_log.append({
            "type": "demo_stopped",
            "message": "[DEMO] Presentation mode deactivated",
            "timestamp": now(),
        })
    return {"success": True, "message": "Demo stopped"}
