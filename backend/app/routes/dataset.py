"""
routes/dataset.py — Dataset CRUD endpoints for FactoryMind AI.

Prefix: /api/dataset
Provides GET and POST endpoints for all four database tables,
plus a CSV export endpoint for production records.
"""

import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import BottleneckRecord, FailureRecord, Machine, ProductionRecord
from app.schemas import (
    BottleneckRecordCreate,
    BottleneckRecordResponse,
    FailureRecordCreate,
    FailureRecordResponse,
    MachineResponse,
    ProductionRecordCreate,
    ProductionRecordResponse,
)

router = APIRouter(prefix="/api/dataset", tags=["Dataset"])


# ─── Machines ──────────────────────────────────────────────────────────────────

@router.get(
    "/machines",
    response_model=List[MachineResponse],
    summary="List all machines",
    description="Returns all machine records stored in the database.",
)
def get_machines(db: Session = Depends(get_db)) -> List[MachineResponse]:
    try:
        return db.query(Machine).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


# ─── Production Records ────────────────────────────────────────────────────────

@router.get(
    "/production",
    response_model=List[ProductionRecordResponse],
    summary="List production records",
    description="Returns the most recent 200 production history records.",
)
def get_production(db: Session = Depends(get_db)) -> List[ProductionRecordResponse]:
    try:
        return (
            db.query(ProductionRecord)
            .order_by(ProductionRecord.recorded_at.desc())
            .limit(200)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


@router.post(
    "/production",
    response_model=ProductionRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Insert a production record",
    description="Manually insert a single production record for a given machine.",
)
def create_production(
    payload: ProductionRecordCreate, db: Session = Depends(get_db)
) -> ProductionRecordResponse:
    try:
        record = ProductionRecord(**payload.model_dump())
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


# ─── Failure Records ───────────────────────────────────────────────────────────

@router.get(
    "/failures",
    response_model=List[FailureRecordResponse],
    summary="List failure records",
    description="Returns all machine failure events stored in the database.",
)
def get_failures(db: Session = Depends(get_db)) -> List[FailureRecordResponse]:
    try:
        return db.query(FailureRecord).order_by(FailureRecord.recorded_at.desc()).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


@router.post(
    "/failure",
    response_model=FailureRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Insert a failure record",
    description="Manually insert a machine failure event.",
)
def create_failure(
    payload: FailureRecordCreate, db: Session = Depends(get_db)
) -> FailureRecordResponse:
    try:
        record = FailureRecord(**payload.model_dump())
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


# ─── Bottleneck Records ────────────────────────────────────────────────────────

@router.get(
    "/bottlenecks",
    response_model=List[BottleneckRecordResponse],
    summary="List bottleneck records",
    description="Returns all bottleneck detection records stored in the database.",
)
def get_bottlenecks(db: Session = Depends(get_db)) -> List[BottleneckRecordResponse]:
    try:
        return (
            db.query(BottleneckRecord)
            .order_by(BottleneckRecord.recorded_at.desc())
            .limit(200)
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


@router.post(
    "/bottleneck",
    response_model=BottleneckRecordResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Insert a bottleneck record",
    description="Manually insert a bottleneck detection event.",
)
def create_bottleneck(
    payload: BottleneckRecordCreate, db: Session = Depends(get_db)
) -> BottleneckRecordResponse:
    try:
        record = BottleneckRecord(**payload.model_dump())
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )


# ─── CSV Export ────────────────────────────────────────────────────────────────

@router.get(
    "/export/production",
    summary="Export production records as CSV",
    description="Downloads all production records as a CSV file.",
    response_class=StreamingResponse,
)
def export_production_csv(db: Session = Depends(get_db)):
    try:
        records = db.query(ProductionRecord).order_by(ProductionRecord.recorded_at.asc()).all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "machine_code", "production_count", "queue_size", "utilization", "downtime", "recorded_at"])
    for r in records:
        writer.writerow([r.id, r.machine_code, r.production_count, r.queue_size, r.utilization, r.downtime, r.recorded_at])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=production_records.csv"},
    )
