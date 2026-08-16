"""Smart load matching — MVP version.

The target design in docs/technical-documentation.html section 7.3 is
embeddings + gradient boosting trained on carrier behavior. There's no real
behavioral data to train anything on yet (this is a demo with a handful of
seed loads), so — same principle as NL search (core/llm.py): ship a
deterministic version that's actually useful today, upgrade to a model
later once there's data worth learning from. No LLM call here at all.

Ranking heuristic: score each open load against the carrier's own history
(every load they've ever been assigned, any status) — equipment type used
before, and origin/destination state overlap with lanes they've run. A
carrier with no history yet gets the plain newest-first list rather than an
empty or broken response — cold start is a known, deterministic case, not
an edge case that falls through.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/loads", tags=["matching"])

_EQUIPMENT_MATCH_WEIGHT = 3
_LANE_STATE_MATCH_WEIGHT = 2


def _state(location: str) -> str:
    """ "Dallas, TX" -> "TX". Locations without a comma (shouldn't happen via
    the create-load form, but don't crash on bad data) fall back to the
    whole string, which just never matches anything — a safe no-op."""
    return location.rsplit(",", 1)[-1].strip().upper()


def _score(
    load: models.Load, equipment_used: set[str], origin_states: set[str], dest_states: set[str]
) -> int:
    score = 0
    if load.equipment_type in equipment_used:
        score += _EQUIPMENT_MATCH_WEIGHT
    if _state(load.origin) in origin_states:
        score += _LANE_STATE_MATCH_WEIGHT
    if _state(load.destination) in dest_states:
        score += _LANE_STATE_MATCH_WEIGHT
    return score


@router.get("/matches", response_model=list[schemas.LoadOut])
def match_loads(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.UserRole.carrier:
        raise HTTPException(status_code=403, detail="Only carriers can view matches")

    open_loads = (
        db.query(models.Load)
        .filter(models.Load.status == models.LoadStatus.open)
        .order_by(models.Load.created_at.desc())
        .all()
    )

    history = db.query(models.Load).filter(models.Load.carrier_id == current_user.id).all()
    if not history:
        return open_loads  # cold start: no signal to rank on, newest-first is the honest default

    equipment_used = {load.equipment_type for load in history}
    origin_states = {_state(load.origin) for load in history}
    dest_states = {_state(load.destination) for load in history}

    scored = [
        (_score(load, equipment_used, origin_states, dest_states), load.created_at, load)
        for load in open_loads
    ]
    scored.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return [load for _, _, load in scored]
