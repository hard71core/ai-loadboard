"""Re-exports the FastAPI dependencies route modules need, so routes import
from one place (`app.api.deps`) instead of reaching into `app.core.*`
individually. Thin on purpose — this just names the seam for when there's
more than get_db/get_current_user to share."""

from ..core.database import get_db
from ..core.security import get_current_user

__all__ = ["get_current_user", "get_db"]
