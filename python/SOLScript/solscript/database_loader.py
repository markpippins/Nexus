"""Database loader — populates the interpreter from the resolution PostgreSQL schema."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from .models import (
    AttributeBinding,
    Concept,
    ConceptAttribute,
    ConceptRelationship,
    ConceptStateTransition,
    Entity,
    Expression,
    ExpressionKind,
    FrameDimension,
    FrameDimensionMeaning,
    FrameDimensionValue,
    Operator,
    Proposition,
    PropositionFrameValue,
    Quantifier,
    RelationshipBinding,
    Representation,
    RepresentationIdentity,
    Rule,
    RuleType,
    Severity,
)

if TYPE_CHECKING:
    from .interpreter import ResolutionInterpreter

try:
    import asyncpg  # type: ignore[import-untyped]
except ImportError:
    asyncpg = None  # type: ignore[assignment]


class DatabaseLoader:
    """Load schema and data from the resolution database into the interpreter."""

    def __init__(self, interpreter: ResolutionInterpreter, pool: Any) -> None:
        self.interpreter = interpreter
        self.pool = pool

    async def load_all(self) -> None:
        """Load all schema and data from the database."""
        await self.load_concepts()
        await self.load_attributes()
        await self.load_relationships()
        await self.load_expressions()
        await self.load_rules()
        await self.load_frame_dimensions()
        await self.load_propositions()
        await self.load_frame_dimension_meanings()
        await self.load_entities()
        await self.load_shrapnel_facts()

    # ── Shrapnel facts (EAV object store) ───────────────────────

    # Physical column names of the typed value extension tables.  The EAV
    # store keeps the type in shrapnel.value.value_type_code and the actual
    # payload in the matching shrapnel.value_<type> row (1:1 by id).
    _SHRAPNEL_TYPE_COLUMNS: Dict[int, str] = {
        1: "value_long",         # bigint
        2: "value_string",       # varchar(255)
        3: "value_double",       # double precision
        4: "value_boolean",      # boolean
        5: "value_timestamp",    # timestamptz
        6: "value_jsonb",        # jsonb
        7: "value_uuid",         # uuid
    }

    async def load_shrapnel_facts(
        self, concept_name: str = "ShrapnelFact"
    ) -> None:
        """Materialize shrapnel EAV objects as interpreter entities.

        Shrapnel is the standalone "facts" datastore (fields/objects/values
        in an EAV layout).  Resolution reasons *about* those facts, so each
        shrapnel object becomes an Entity whose attributes are the object's
        field values (keyed by property_name).  Objects are attached to a
        concept named `concept_name` so query_builder/inference can reference
        them like any other resolution entity.

        The load is best-effort: if the shrapnel schema is absent or any
        object is malformed, that part is skipped without failing the whole
        load (mirrors the external-projection tolerance in load_entities).
        """
        async with self.pool.acquire() as conn:
            try:
                field_rows = await conn.fetch(
                    "SELECT id, name, property_name, field_type_code "
                    "FROM shrapnel.field"
                )
            except Exception:
                # shrapnel schema not present (or not migrated) — fine
                return

            fields: Dict[int, Dict[str, Any]] = {}
            for fr in field_rows:
                fields[fr["id"]] = {
                    "name": fr["name"],
                    "property_name": fr["property_name"],
                    "field_type_code": fr["field_type_code"],
                }
            if not fields:
                return

            # All objects and their attribute bindings in one shot.
            object_rows = await conn.fetch(
                "SELECT o.id AS object_id, oav.field_id, oav.value_id, "
                "v.value_type_code "
                "FROM shrapnel.object_instance o "
                "JOIN shrapnel.object_attribute_value oav ON oav.object_id = o.id "
                "JOIN shrapnel.value v ON v.id = oav.value_id"
            )

            # Pull typed values per extension table (best-effort per table).
            typed: Dict[Tuple[int, str], Any] = {}
            for table in self._SHRAPNEL_TYPE_COLUMNS.values():
                try:
                    rows = await conn.fetch(f"SELECT id, value FROM shrapnel.{table}")
                except Exception:
                    continue
                for row in rows:
                    typed[(row["id"], table)] = row["value"]

            # Assemble per-object attribute dicts.
            objects: Dict[int, Dict[str, Any]] = {}
            for orow in object_rows:
                oid = orow["object_id"]
                field = fields.get(orow["field_id"])
                if not field:
                    continue
                value = None
                table = self._SHRAPNEL_TYPE_COLUMNS.get(orow["value_type_code"])
                if table is not None:
                    value = typed.get((orow["value_id"], table))
                attr_key = field["property_name"] or field["name"]
                objects.setdefault(oid, {})[attr_key] = value

            if not objects:
                return

            # Register entities under the given concept (create if absent).
            concept = self.interpreter.get_concept_by_name(concept_name)
            if not concept:
                concept = Concept(
                    id="f0000000-0000-4000-8000-0000000000f1",
                    name=concept_name,
                    description="Shrapnel EAV fact objects (standalone facts store)",
                )
                self.interpreter.add_concept(concept)

            for oid, attrs in objects.items():
                entity = Entity(
                    id=f"shrapnel:{oid}",
                    concept_id=concept.id,
                    attributes=attrs,
                    external_id=str(oid),
                )
                self.interpreter.entities[entity.id] = entity

    # ── Concepts ─────────────────────────────────────────────────

    async def load_concepts(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, description FROM resolution.concept "
                "WHERE expired_at IS NULL"
            )
            for row in rows:
                concept = Concept(
                    id=str(row["id"]),
                    name=row["name"],
                    description=row["description"],
                )
                self.interpreter.add_concept(concept)

    # ── Attributes ───────────────────────────────────────────────

    async def load_attributes(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT ca.id, ca.concept_id, ca.name, ca.description, "
                "ca.value_type, ca.is_state_attribute, "
                "cab.schema_name, cab.table_name, cab.column_name "
                "FROM resolution.concept_attribute ca "
                "LEFT JOIN resolution.concept_attribute_binding cab "
                "ON cab.attribute_id = ca.id "
                "WHERE ca.concept_id IN "
                "(SELECT id FROM resolution.concept WHERE expired_at IS NULL)"
            )
            for row in rows:
                binding = None
                if row["schema_name"] and row["table_name"] and row["column_name"]:
                    binding = AttributeBinding(
                        schema_name=row["schema_name"],
                        table_name=row["table_name"],
                        column_name=row["column_name"],
                    )
                attr = ConceptAttribute(
                    id=str(row["id"]),
                    concept_id=str(row["concept_id"]),
                    name=row["name"],
                    description=row["description"],
                    value_type=row["value_type"],
                    is_state_attribute=row["is_state_attribute"],
                    binding=binding,
                )
                values = await conn.fetch(
                    "SELECT value FROM resolution.concept_attribute_value "
                    "WHERE attribute_id = $1",
                    row["id"],
                )
                attr.allowed_values = [v["value"] for v in values]

                concept = self.interpreter.get_concept(str(row["concept_id"]))
                if concept:
                    concept.attributes[attr.id] = attr

    # ── Relationships ────────────────────────────────────────────

    async def load_relationships(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT cr.id, cr.from_concept_id, cr.to_concept_id, "
                "cr.relationship_type, cr.path, cr.notes, "
                "crb.from_schema, crb.from_table, crb.from_column, "
                "crb.to_schema, crb.to_table, crb.to_column "
                "FROM resolution.concept_relationship cr "
                "LEFT JOIN resolution.concept_relationship_binding crb "
                "  ON crb.concept_relationship_id = cr.id "
                "WHERE cr.expired_at IS NULL"
            )
            for row in rows:
                binding = None
                if row["from_schema"] and row["to_schema"]:
                    binding = RelationshipBinding(
                        from_schema=row["from_schema"],
                        from_table=row["from_table"],
                        from_column=row["from_column"],
                        to_schema=row["to_schema"],
                        to_table=row["to_table"],
                        to_column=row["to_column"],
                    )
                rel = ConceptRelationship(
                    id=str(row["id"]),
                    from_concept_id=str(row["from_concept_id"]),
                    to_concept_id=str(row["to_concept_id"]),
                    relationship_type=row["relationship_type"],
                    path=row["path"],
                    notes=row["notes"],
                    binding=binding,
                )
                self.interpreter.relationships[rel.id] = rel
                concept = self.interpreter.get_concept(rel.from_concept_id)
                if concept:
                    concept.relationships[rel.id] = rel

    # ── Expressions ──────────────────────────────────────────────

    async def load_expressions(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, kind, operator, literal_value, attribute_id, "
                "function_name, return_type, label, "
                "concept_relationship_id, quantifier, "
                "referenced_proposition_id, proposition_ref_field "
                "FROM resolution.expression"
            )
            expressions: Dict[str, Expression] = {}
            for row in rows:
                expr = Expression(
                    id=str(row["id"]),
                    kind=ExpressionKind(row["kind"]),
                    return_type=row["return_type"],
                    operator=Operator(row["operator"]) if row["operator"] else None,
                    literal_value=row["literal_value"],
                    attribute_id=str(row["attribute_id"]) if row["attribute_id"] else None,
                    function_name=row["function_name"],
                    concept_relationship_id=(
                        str(row["concept_relationship_id"])
                        if row["concept_relationship_id"]
                        else None
                    ),
                    quantifier=(
                        Quantifier(row["quantifier"]) if row["quantifier"] else None
                    ),
                    referenced_proposition_id=(
                        str(row["referenced_proposition_id"])
                        if row["referenced_proposition_id"]
                        else None
                    ),
                    proposition_ref_field=row["proposition_ref_field"],
                    label=row["label"],
                )
                expressions[expr.id] = expr
                self.interpreter.expressions[expr.id] = expr

            operand_rows = await conn.fetch(
                "SELECT parent_expression_id, child_expression_id, position "
                "FROM resolution.expression_operand "
                "ORDER BY parent_expression_id, position"
            )
            for row in operand_rows:
                parent = self.interpreter.expressions.get(str(row["parent_expression_id"]))
                child = self.interpreter.expressions.get(str(row["child_expression_id"]))
                if parent and child:
                    pos = row["position"] - 1
                    while len(parent.operands) <= pos:
                        parent.operands.append(
                            Expression(
                                id="placeholder",
                                kind=ExpressionKind.LITERAL,
                                return_type="any",
                            )
                        )
                    parent.operands[pos] = child

    # ── Rules ────────────────────────────────────────────────────

    async def load_rules(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, rule_type, expression_id, severity, "
                "concept_id, concept_relationship_id, representation_id, "
                "notes, state_transition_id, is_relational_check "
                "FROM resolution.rule WHERE expired_at IS NULL"
            )
            for row in rows:
                rule = Rule(
                    id=str(row["id"]),
                    name=row["name"],
                    rule_type=RuleType(row["rule_type"]),
                    expression=(
                        self.interpreter.expressions.get(str(row["expression_id"]))
                        if row["expression_id"]
                        else None
                    ),
                    severity=Severity(row["severity"]),
                    concept_id=str(row["concept_id"]) if row["concept_id"] else None,
                    concept_relationship_id=(
                        str(row["concept_relationship_id"])
                        if row["concept_relationship_id"]
                        else None
                    ),
                    representation_id=(
                        str(row["representation_id"])
                        if row["representation_id"]
                        else None
                    ),
                    state_transition_id=(
                        str(row["state_transition_id"])
                        if row["state_transition_id"]
                        else None
                    ),
                    notes=row["notes"],
                    is_relational_check=row["is_relational_check"],
                )
                self.interpreter.rules[rule.id] = rule

                if rule.concept_id:
                    concept = self.interpreter.get_concept(rule.concept_id)
                    if concept:
                        if rule.rule_type == RuleType.INVARIANT:
                            concept.invariants.append(rule)
                        elif rule.rule_type == RuleType.DERIVATION:
                            concept.derivations.append(rule)
                elif rule.concept_relationship_id:
                    rel = self.interpreter.get_relationship(rule.concept_relationship_id)
                    if rel and rule.rule_type == RuleType.CONDITIONAL:
                        rel.conditionals.append(rule)
                elif rule.state_transition_id:
                    trans = self.interpreter.get_state_transition(rule.state_transition_id)
                    if trans and rule.rule_type == RuleType.GUARD:
                        trans.guards.append(rule)

    # ── Frame dimensions (v31) ──────────────────────────────────

    async def load_frame_dimensions(self) -> None:
        """Load frame_dimension, frame_dimension_value, and proposition_frame_value."""
        async with self.pool.acquire() as conn:
            fd_rows = await conn.fetch(
                "SELECT id, name, description, value_kind, scalar_type "
                "FROM resolution.frame_dimension"
            )
            for row in fd_rows:
                dim = FrameDimension(
                    id=str(row["id"]),
                    name=row["name"],
                    description=row["description"],
                    value_kind=row["value_kind"],
                    scalar_type=row["scalar_type"],
                )
                self.interpreter.frame_dimensions[dim.id] = dim

            fdv_rows = await conn.fetch(
                "SELECT id, dimension_id, value, description "
                "FROM resolution.frame_dimension_value"
            )
            for row in fdv_rows:
                val = FrameDimensionValue(
                    id=str(row["id"]),
                    dimension_id=str(row["dimension_id"]),
                    value=row["value"],
                    description=row["description"],
                )
                self.interpreter.frame_dimension_values[val.id] = val

            pfv_rows = await conn.fetch(
                "SELECT id, proposition_id, dimension_id, "
                "reference_value_id, scalar_value "
                "FROM resolution.proposition_frame_value"
            )
            for row in pfv_rows:
                pfv = PropositionFrameValue(
                    id=str(row["id"]),
                    proposition_id=str(row["proposition_id"]),
                    dimension_id=str(row["dimension_id"]),
                    reference_value_id=(
                        str(row["reference_value_id"])
                        if row["reference_value_id"]
                        else None
                    ),
                    scalar_value=row["scalar_value"],
                )
                self.interpreter.add_proposition_frame_value(pfv)

    # ── Propositions ─────────────────────────────────────────────

    async def load_propositions(self) -> None:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, title, description, asset_concept_id, "
                "subject_entity_id, disposition_value_id, value, "
                "grounding_status_value_id, semantic_type_id "
                "FROM resolution.proposition"
            )
            for row in rows:
                from .models import Disposition as Disp

                disp_raw = str(row["disposition_value_id"]) if row["disposition_value_id"] else None
                # Map UUID to Disposition enum where possible; store raw UUID otherwise
                disp_map = {}
                disp = disp_map.get(disp_raw, Disp.PROPOSED) if disp_raw else Disp.PROPOSED
                prop = Proposition(
                    id=str(row["id"]),
                    title=row["title"],
                    description=row["description"],
                    asset_concept_id=str(row["asset_concept_id"]),
                    subject_entity_id=str(row["subject_entity_id"]),
                    disposition=disp,
                    value=row["value"],
                    grounding_status=str(row["grounding_status_value_id"]) if row["grounding_status_value_id"] else None,
                    semantic_type_id=(
                        str(row["semantic_type_id"])
                        if row["semantic_type_id"]
                        else None
                    ),
                )
                self.interpreter.propositions[prop.id] = prop

    # ── Frame dimension meanings (v35) ──────────────────────────

    async def load_frame_dimension_meanings(self) -> None:
        """Load frame_dimension_meaning bridge rows (proposition → dimension/value)."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, proposition_id, dimension_id, frame_dimension_value_id "
                "FROM resolution.frame_dimension_meaning"
            )
            for row in rows:
                meaning = FrameDimensionMeaning(
                    id=str(row["id"]),
                    proposition_id=str(row["proposition_id"]),
                    dimension_id=(
                        str(row["dimension_id"]) if row["dimension_id"] else None
                    ),
                    frame_dimension_value_id=(
                        str(row["frame_dimension_value_id"])
                        if row["frame_dimension_value_id"]
                        else None
                    ),
                )
                self.interpreter.frame_dimension_meanings[meaning.id] = meaning

    # ── Entities ─────────────────────────────────────────────────

    async def load_entities(self, concept_name: Optional[str] = None) -> None:
        async with self.pool.acquire() as conn:
            sql = (
                "SELECT r.id, r.concept_id, r.schema_name, r.table_name, "
                "ri.identity_expression "
                "FROM resolution.representation r "
                "JOIN resolution.representation_identity ri "
                "ON ri.representation_id = r.id "
                "JOIN resolution.concept c ON c.id = r.concept_id "
                "WHERE r.expired_at IS NULL"
            )
            params: List[Any] = []
            if concept_name:
                sql += " AND c.name = $1"
                params.append(concept_name)

            rows = await conn.fetch(sql, *params)
            for row in rows:
                schema = row["schema_name"]
                table = row["table_name"]
                # Only load tables from schemas we own — skip external
                # projections (nebula, vision, conduit) that may not exist
                # or have incompatible schemas.
                if schema not in ("resolution",):
                    continue
                try:
                    table_sql = f"SELECT * FROM {schema}.{table}"
                    data_rows = await conn.fetch(table_sql)
                except Exception:
                    # Table may not exist or be empty — skip silently
                    continue
                for data_row in data_rows:
                    attributes = dict(data_row)
                    entity = Entity(
                        id=str(data_row["id"]),
                        concept_id=str(row["concept_id"]),
                        attributes=attributes,
                        external_id=(
                            str(data_row["external_id"])
                            if "external_id" in data_row
                            else None
                        ),
                    )
                    self.interpreter.entities[entity.id] = entity
