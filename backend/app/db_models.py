"""
db_models.py — SQLAlchemy ORM models for FactoryMind AI database tables.

Tables: machines, production_records, failure_records, bottleneck_records
All tables are created only if they do not already exist.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Machine(Base):
    """Maps to the 'machines' table."""

    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    machine_code = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(64), nullable=False)
    processing_time = Column(Float, nullable=False, default=1.0)
    status = Column(String(16), nullable=False, default="running")


class ProductionRecord(Base):
    """Maps to the 'production_records' table."""

    __tablename__ = "production_records"

    id = Column(Integer, primary_key=True, index=True)
    machine_code = Column(String(16), nullable=False, index=True)
    production_count = Column(Integer, nullable=False, default=0)
    queue_size = Column(Integer, nullable=False, default=0)
    utilization = Column(Float, nullable=False, default=0.0)
    downtime = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class FailureRecord(Base):
    """Maps to the 'failure_records' table."""

    __tablename__ = "failure_records"

    id = Column(Integer, primary_key=True, index=True)
    machine_code = Column(String(16), nullable=False, index=True)
    failure_type = Column(String(64), nullable=False, default="unplanned")
    downtime = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)


class BottleneckRecord(Base):
    """Maps to the 'bottleneck_records' table."""

    __tablename__ = "bottleneck_records"

    id = Column(Integer, primary_key=True, index=True)
    machine_code = Column(String(16), nullable=False, index=True)
    utilization = Column(Float, nullable=False, default=0.0)
    queue_size = Column(Integer, nullable=False, default=0)
    recommendation = Column(Text, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
