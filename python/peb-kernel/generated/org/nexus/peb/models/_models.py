# coding=utf-8
# pylint: disable=useless-super-delegation

from typing import Any, Mapping, Optional, overload

from .._utils.model_base import Model as _Model, rest_field


class AdmissionResponse(_Model):
    """Response from the admission controller.

    :ivar message: Human-readable outcome message. Required.
    :vartype message: str
    :ivar admitted: Whether the request was admitted (true) or denied (false). Required.
    :vartype admitted: bool
    """

    message: str = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Human-readable outcome message. Required."""
    admitted: bool = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Whether the request was admitted (true) or denied (false). Required."""

    @overload
    def __init__(
        self,
        *,
        message: str,
        admitted: bool,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class PebHealthResponse(_Model):
    """Actuator-compatible health response for the PEB database boundary.

    :ivar status: Health status, normally UP or DOWN. Required.
    :vartype status: str
    :ivar database: Database connectivity summary.
    :vartype database: str
    :ivar schema: PEB schema name.
    :vartype schema: str
    :ivar catalog: Database catalog when available.
    :vartype catalog: str
    :ivar error: Diagnostic detail when the database is unavailable.
    :vartype error: str
    """

    status: str = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Health status, normally UP or DOWN. Required."""
    database: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Database connectivity summary."""
    schema: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """PEB schema name."""
    catalog: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Database catalog when available."""
    error: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Diagnostic detail when the database is unavailable."""

    @overload
    def __init__(
        self,
        *,
        status: str,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        catalog: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)


class PebTransactionRequest(_Model):
    """Request payload for the PEB MCP facade endpoint.

    :ivar id: Optional caller-supplied UUID; the Python domain assigns one when omitted.
    :vartype id: str
    :ivar idempotency_key: Caller-provided idempotency key for safe retry. Required.
    :vartype idempotency_key: str
    :ivar entity_id: Entity identifier initiating this request. Required.
    :vartype entity_id: str
    :ivar tool_name: MCP facade tool name to dispatch. Required.
    :vartype tool_name: str
    :ivar input: Arbitrary JSON payload for the tool. Required.
    :vartype input: any
    """

    id: Optional[str] = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Optional caller-supplied UUID; the Python domain assigns one when omitted."""
    idempotency_key: str = rest_field(name="idempotencyKey", visibility=["read", "create", "update", "delete", "query"])
    """Caller-provided idempotency key for safe retry. Required."""
    entity_id: str = rest_field(name="entityId", visibility=["read", "create", "update", "delete", "query"])
    """Entity identifier initiating this request. Required."""
    tool_name: str = rest_field(name="toolName", visibility=["read", "create", "update", "delete", "query"])
    """MCP facade tool name to dispatch. Required."""
    input: Any = rest_field(visibility=["read", "create", "update", "delete", "query"])
    """Arbitrary JSON payload for the tool. Required."""

    @overload
    def __init__(
        self,
        *,
        idempotency_key: str,
        entity_id: str,
        tool_name: str,
        input: Any,
        id: Optional[str] = None,  # pylint: disable=redefined-builtin
    ) -> None: ...

    @overload
    def __init__(self, mapping: Mapping[str, Any]) -> None:
        """
        :param mapping: raw JSON to initialize the model.
        :type mapping: Mapping[str, Any]
        """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
