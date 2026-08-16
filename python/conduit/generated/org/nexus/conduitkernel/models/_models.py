# coding=utf-8
# pylint: disable=useless-super-delegation

from typing import Any, Mapping, Optional, TYPE_CHECKING, overload

from .._utils.model_base import Model as _Model, rest_field

if TYPE_CHECKING:
    from .. import models as _models


class BreakerStateResponse(_Model):
    """Circuit breaker state.

    :ivar state: Required.
    :vartype state: str
    :ivar failures:
    :vartype failures: int
    :ivar open:
    :vartype open: bool
    """

    state: str = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    failures: Optional[int] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    open: Optional[bool] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        state: str,
        failures: Optional[int] = None,
        open: Optional[bool] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class CompareResponse(_Model):
    """Replay comparison between two runs.

    :ivar differences: Required.
    :vartype differences: list[dict[str, any]]
    :ivar equal: Required.
    :vartype equal: bool
    """

    differences: list[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    equal: bool = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        differences: list[dict[str, Any]],
        equal: bool,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class ConsistencyCheck(_Model):
    """Consistency check result.

    :ivar consistent: Required.
    :vartype consistent: bool
    :ivar issues: Required.
    :vartype issues: list[str]
    """

    consistent: bool = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    issues: list[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        consistent: bool,
        issues: list[str],
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class DeltaResponse(_Model):
    """Delta application result.

    :ivar applied: Required.
    :vartype applied: bool
    :ivar delta:
    :vartype delta: dict[str, any]
    """

    applied: bool = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    delta: Optional[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        applied: bool,
        delta: Optional[dict[str, Any]] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class GraphResponse(_Model):
    """State graph response — nodes and edges of the WRP state DAG.

    :ivar nodes: Required.
    :vartype nodes: list[dict[str, any]]
    :ivar edges: Required.
    :vartype edges: list[dict[str, any]]
    """

    nodes: list[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    edges: list[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class IdentityListResponse(_Model):
    """IdentityListResponse.

    :ivar identities: Required.
    :vartype identities: list[~org.nexus.conduitkernel.models.IdentityResponse]
    """

    identities: list["_models.IdentityResponse"] = rest_field(
        visibility=["read", "create", "update", "delete", "query"]
    )
    """Required."""

    @overload
    def __init__(
        self,
        *,
        identities: list["_models.IdentityResponse"],
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class IdentityResponse(_Model):
    """A work-request identity record.

    :ivar identity_id: Required.
    :vartype identity_id: str
    :ivar label: Human-facing identity label (name/email/role).
    :vartype label: str
    :ivar attributes: Opaque identity attributes.
    :vartype attributes: dict[str, any]
    """

    identity_id: str = rest_field(name="identityId", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    label: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Human-facing identity label (name/email/role)."""
    attributes: Optional[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Opaque identity attributes."""

    @overload
    def __init__(
        self,
        *,
        identity_id: str,
        label: Optional[str] = None,
        attributes: Optional[dict[str, Any]] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class IdentityUpdateResponse(_Model):
    """IdentityUpdateResponse.

    :ivar identity_id: Required.
    :vartype identity_id: str
    :ivar updated: Required.
    :vartype updated: bool
    """

    identity_id: str = rest_field(name="identityId", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    updated: bool = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        identity_id: str,
        updated: bool,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class MetricsResponse(_Model):
    """Metrics (Prometheus text).

    :ivar metrics: Required.
    :vartype metrics: str
    """

    metrics: str = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        metrics: str,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class PlanDetailResponse(_Model):
    """Detail for a single plan.

    :ivar plan_num: Required.
    :vartype plan_num: str
    :ivar state:
    :vartype state: str
    :ivar receipts:
    :vartype receipts: list[dict[str, any]]
    """

    plan_num: str = rest_field(name="planNum", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    state: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    receipts: Optional[list[dict[str, Any]]] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        plan_num: str,
        state: Optional[str] = None,
        receipts: Optional[list[dict[str, Any]]] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class ReceiptResponse(_Model):
    """Receipt record.

    :ivar receipt_id: Required.
    :vartype receipt_id: str
    :ivar plan_id: Required.
    :vartype plan_id: str
    :ivar type:
    :vartype type: str
    :ivar payload:
    :vartype payload: dict[str, any]
    """

    receipt_id: str = rest_field(name="receiptId", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    plan_id: str = rest_field(name="planId", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    type: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    payload: Optional[dict[str, Any]] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        receipt_id: str,
        plan_id: str,
        type: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class ReplayResponse(_Model):
    """Replay run summary.

    :ivar replayed: Required.
    :vartype replayed: int
    :ivar events:
    :vartype events: list[dict[str, any]]
    """

    replayed: int = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    events: Optional[list[dict[str, Any]]] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        replayed: int,
        events: Optional[list[dict[str, Any]]] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class SessionListResponse(_Model):
    """SessionListResponse.

    :ivar sessions: Required.
    :vartype sessions: list[~org.nexus.conduitkernel.models.SessionResponse]
    """

    sessions: list["_models.SessionResponse"] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Required."""

    @overload
    def __init__(
        self,
        *,
        sessions: list["_models.SessionResponse"],
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class SessionResponse(_Model):
    """Session record.

    :ivar session_id: Required.
    :vartype session_id: str
    :ivar status:
    :vartype status: str
    :ivar running:
    :vartype running: bool
    :ivar cost:
    :vartype cost: float
    """

    session_id: str = rest_field(name="sessionId", visibility=["read", "create", "update", "delete", "query"])
    """Required."""
    status: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    running: Optional[bool] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    cost: Optional[float] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        session_id: str,
        status: Optional[str] = None,
        running: Optional[bool] = None,
        cost: Optional[float] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class StateSummary(_Model):
    """Current state summary.

    :ivar state:
    :vartype state: str
    :ivar revision:
    :vartype revision: str
    """

    state: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    revision: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])

    @overload
    def __init__(
        self,
        *,
        state: Optional[str] = None,
        revision: Optional[str] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
