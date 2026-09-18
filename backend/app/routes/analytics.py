"""
routes/analytics.py — Analytics summary endpoint for FactoryMind AI.

Prefix: /api/analytics
Aggregates data from all database tables to produce a summary.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.db_models import BottleneckRecord, FailureRecord, ProductionRecord
from app.schemas import AnalyticsSummary

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get(
    "/summary",
    response_model=AnalyticsSummary,
    summary="Analytics summary",
    description=(
        "Returns aggregated factory analytics: total production, average utilization, "
        "total downtime, failure count, highest-utilization machine, and current bottleneck."
    ),
)
def get_summary(db: Session = Depends(get_db)) -> AnalyticsSummary:
    try:
        # Total production across all production records
        total_production_result = db.query(
            func.coalesce(func.sum(ProductionRecord.production_count), 0)
        ).scalar()
        total_production = int(total_production_result)

        # Average utilization across all production records
        avg_utilization_result = db.query(
            func.coalesce(func.avg(ProductionRecord.utilization), 0.0)
        ).scalar()
        average_utilization = round(float(avg_utilization_result), 2)

        # Total downtime across all production records
        total_downtime_result = db.query(
            func.coalesce(func.sum(ProductionRecord.downtime), 0)
        ).scalar()
        total_downtime = int(total_downtime_result)

        # Total failure events
        failure_count = db.query(func.count(FailureRecord.id)).scalar() or 0

        # Machine with highest average utilization
        highest_util_row = (
            db.query(
                ProductionRecord.machine_code,
                func.avg(ProductionRecord.utilization).label("avg_util"),
            )
            .group_by(ProductionRecord.machine_code)
            .order_by(func.avg(ProductionRecord.utilization).desc())
            .first()
        )
        highest_utilization_machine = highest_util_row[0] if highest_util_row else None

        # Most recent bottleneck machine
        latest_bottleneck = (
            db.query(BottleneckRecord)
            .order_by(BottleneckRecord.recorded_at.desc())
            .first()
        )
        current_bottleneck_machine = latest_bottleneck.machine_code if latest_bottleneck else None

        return AnalyticsSummary(
            total_production=total_production,
            average_utilization=average_utilization,
            total_downtime=total_downtime,
            failure_count=failure_count,
            highest_utilization_machine=highest_utilization_machine,
            current_bottleneck_machine=current_bottleneck_machine,
        )

    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )
