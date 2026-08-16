"""Arrival-time estimate — MVP version.

The target design in docs/technical-documentation.html section 7.7 is a
regression model on carrier GPS telematics, live traffic, weather, and
remaining HOS drive-time — none of which exist yet (no telematics feed, no
carrier GPS, no traffic/weather API). Same principle as Matching
(api/routes/matching.py) and NL Search (core/llm.py): ship a deterministic
version that's actually useful today. See core/eta.py for the heuristic
itself (real driving distance/duration via Nominatim+OSRM, widened into a
band to stand in for rest-stop time).

No auth required — same as GET /api/loads/{id}, this is public read data.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models, schemas
from ...core.eta import estimate_transit
from ..deps import get_db

router = APIRouter(prefix="/api/loads", tags=["eta"])


@router.get("/{load_id:int}/eta", response_model=schemas.LoadETA)
def get_load_eta(load_id: int, db: Session = Depends(get_db)):
    load = db.query(models.Load).filter(models.Load.id == load_id).first()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")

    transit = estimate_transit(load.origin, load.destination)
    if not transit:
        return schemas.LoadETA(
            load_id=load.id,
            status=load.status,
            basis="Live routing data is temporarily unavailable for this lane.",
        )

    if not load.accepted_at:
        return schemas.LoadETA(
            load_id=load.id,
            status=load.status,
            basis=(
                "Not yet accepted — showing estimated transit time only; "
                "an arrival window needs a pickup/departure time to measure from."
            ),
            distance_miles=transit.distance_miles,
            drive_hours_min=transit.drive_hours_min,
            drive_hours_max=transit.drive_hours_max,
        )

    return schemas.LoadETA(
        load_id=load.id,
        status=load.status,
        basis=(
            "Estimated from accepted_at plus real driving distance/duration (OSRM), "
            "widened into a band to approximate mandatory rest stops — no live "
            "telematics, traffic, or weather data feeds into this yet."
        ),
        distance_miles=transit.distance_miles,
        drive_hours_min=transit.drive_hours_min,
        drive_hours_max=transit.drive_hours_max,
        eta_earliest=load.accepted_at + timedelta(hours=transit.drive_hours_min),
        eta_latest=load.accepted_at + timedelta(hours=transit.drive_hours_max),
    )
