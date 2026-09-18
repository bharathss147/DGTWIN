import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["project"] == "FactoryMind AI"
    assert data["status"] == "online"

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

def test_factory_state():
    response = client.get("/api/factory/state")
    assert response.status_code == 200
    data = response.json()
    assert "factory_running" in data
    assert "total_production" in data
    assert "machines" in data
    assert len(data["machines"]) == 5
    machine_ids = [m["id"] for m in data["machines"]]
    assert machine_ids == ["M1", "M2", "M3", "M4", "M5"]

def test_start_stop_simulation():
    # Stop simulation
    res_stop = client.post("/api/factory/stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["success"] is True

    res_state = client.get("/api/factory/state")
    assert res_state.json()["factory_running"] is False

    # Start simulation
    res_start = client.post("/api/factory/start")
    assert res_start.status_code == 200
    assert res_start.json()["success"] is True

    res_state2 = client.get("/api/factory/state")
    assert res_state2.json()["factory_running"] is True

def test_machine_failure_and_recovery():
    # Test machine failure for M1
    res_fail = client.post("/api/factory/failure/M1")
    assert res_fail.status_code == 200
    assert res_fail.json()["success"] is True
    assert "offline" in res_fail.json()["message"]

    res_state = client.get("/api/factory/state")
    m1 = next(m for m in res_state.json()["machines"] if m["id"] == "M1")
    assert m1["status"] == "offline"

    # Test machine recovery for M1
    res_rec = client.post("/api/factory/recover/M1")
    assert res_rec.status_code == 200
    assert res_rec.json()["success"] is True

    res_state2 = client.get("/api/factory/state")
    m1_rec = next(m for m in res_state2.json()["machines"] if m["id"] == "M1")
    assert m1_rec["status"] == "running"

def test_invalid_machine_id():
    res_fail = client.post("/api/factory/failure/INVALID99")
    assert res_fail.status_code == 404

    res_rec = client.post("/api/factory/recover/INVALID99")
    assert res_rec.status_code == 404

def test_factory_reset():
    res_reset = client.post("/api/factory/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["success"] is True

    res_state = client.get("/api/factory/state")
    data = res_state.json()
    assert data["total_production"] == 0
    assert data["total_downtime"] == 0
    for m in data["machines"]:
        assert m["status"] == "running"
        assert m["completed"] == 0
        assert m["downtime"] == 0


def test_update_machine_speed():
    # Update M3 Assembly processing time to 4.5s
    res_speed = client.post("/api/factory/machine/M3/speed", json={"processing_time": 4.5})
    assert res_speed.status_code == 200
    assert res_speed.json()["success"] is True

    res_state = client.get("/api/factory/state")
    m3 = next(m for m in res_state.json()["machines"] if m["id"] == "M3")
    assert m3["processing_time"] == 4.5

    # Test invalid speed limits
    res_invalid = client.post("/api/factory/machine/M3/speed", json={"processing_time": -5.0})
    assert res_invalid.status_code == 400

