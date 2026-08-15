/**
 * Shrapnel Data Models
 *
 * SQL-generation (sqlgen), database (db), and value-store (value) JPA
 * entities. Maps to JVM package com.aibizarchitect.nexus.shrapnel.model.*.
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.shrapnel {

  // ─── sqlgen ─────────────────────────────────────────────

  /** Join type code. */
  enum JoinTypeEnum {
    INNER,
    LEFT,
    RIGHT,
    FULL,
  }

  /** A database table reference. */
  model Table {
    id?: int64;
    name: string;
    schema?: string;
  }

  /** A column within a table. */
  model Column {
    id?: int64;
    name: string;
    table?: Table;
    index?: int32;
  }

  /** A join relationship descriptor. */
  model JoinType {
    code?: int32;
    name: string;
  }

  /** A join between two columns. */
  model Join {
    id?: int64;
    joinColumnA?: Column;
    joinColumnB?: Column;
    joinType?: JoinType;
  }

  /** A query definition. */
  model Query {
    id?: int64;
    name: string;
    schema?: string;
  }

  // ─── db ────────────────────────────────────────────────

  /** Field type code/name. */
  model DBFieldType {
    code?: int32;
    name: string;
  }

  /** A data source configuration. */
  model DBDataSource {
    id?: int64;
    name: string;
    scriptName?: string;
  }

  /** A field within a data source. */
  model DBField {
    id?: int64;
    name: string;
    propertyName?: string;
    label?: string;
    index?: int32;
  }

  // ─── value ─────────────────────────────────────────────

  /** Discriminated value type. */
  enum ValueTypeEnum {
    STRING,
    LONG,
  }

  /** Base value entity. */
  model Value {
    id?: int64;
  }

  /** A string value. */
  model StringValue {
    id?: int64;
    value?: string;
  }

  /** A long value. */
  model LongValue {
    id?: int64;
    value?: int64;
  }

  /** Value type descriptor. */
  model ValueType {
    code?: int32;
    tableName?: string;
  }
}
