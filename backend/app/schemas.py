"""
schemas.py — Pydantic v2 request and response schemas for FactoryMind AI.

Covers all four database tables plus the analytics summary endpoint.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ─── Machine ──────────────────────────────────────────────────────────────────

class MachineBase(BaseModel):
    machine_code: str
    name: str
    processing_time: float
    status: str


class MachineCreate(MachineBase):
    pass


class MachineResponse(MachineBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ─── Production Record ─────────────────────────────────────────────────────────

class ProductionRecordCreate(BaseModel):
    machine_code: str
    production_count: int
    queue_size: int
    utilization: float
    downtime: int


class ProductionRecordResponse(ProductionRecordCreate):
    id: int
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Failure Record ────────────────────────────────────────────────────────────

class FailureRecordCreate(BaseModel):
    machine_code: str
    failure_type: str = "unplanned"
    downtime: int = 0


class FailureRecordResponse(FailureRecordCreate):
    id: int
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Bottleneck Record ─────────────────────────────────────────────────────────

class BottleneckRecordCreate(BaseModel):
    machine_code: str
    utilization: float
    queue_size: int
    recommendation: Optional[str] = None


class BottleneckRecordResponse(BottleneckRecordCreate):
    id: int
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Analytics Summary ─────────────────────────────────────────────────────────

class AnalyticsSummary(BaseModel):
    total_production: int
    average_utilization: float
    total_downtime: int
    failure_count: int
    highest_utilization_machine: Optional[str]
    current_bottleneck_machine: Optional[str]
