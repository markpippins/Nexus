/**
 * draft-srv — TypeSpec Models
 *
 * Reverse-engineered from typescript/draft-srv/src/drivers/types.ts and
 * routes/db.ts. Shapes reflect the wire contract data-explorer-ui speaks.
 */
namespace org.nexus.draftsrv {

  /** Connection parameters supplied per request; nothing is persisted server-side. */
  model ConnSpec {
    engine?: string;        // "postgres" | "mysql" (absent => postgres)
    host?: string;
    port?: int32 | string;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
  }

  /** One column of a discovered table. */
  model ColumnInfo {
    name: string;
    type: string;
    isPrimaryKey?: boolean;
    isNullable?: boolean;
    isForeignKey?: boolean;
    referencesTable?: string;
    referencesColumn?: string;
    defaultValue?: string;
  }

  model IndexInfo {
    name: string;
    columns: string[];
    isUnique?: boolean;
  }

  model TableInfo {
    name: string;
    schema: string;
    rowCount?: int64;
    columns: ColumnInfo[];
    indexes?: IndexInfo[];
    comment?: string;
  }

  model ViewInfo {
    name: string;
    schema: string;
    definition?: string;
  }

  model TriggerInfo {
    name: string;
    schema: string;
    tableName: string;
    timing?: string;
    event?: string;
    functionName?: string;
    definition?: string;
  }

  model ProcedureInfo {
    name: string;
    schema: string;
    returnType?: string;
    parameters?: {name: string, type: string}[];
    definition?: string;
    comment?: string;
  }

  model SchemaObject {
    name: string;
    tables: TableInfo[];
    views: ViewInfo[];
    triggers: TriggerInfo[];
    procedures: ProcedureInfo[];
  }

  model EngineCapabilities {
    id: string;
    label: string;
    defaultPort: int32;
    available: boolean;
    missingDeps: string[];
    supportsDdl: boolean;
    supportsSchemas: boolean;
  }

  model QueryResult {
    columns: string[];
    columnTypes: Record<string>;
    rows: Record<string>[];
    rowCount: int32;
    affectedRows?: int32 | null;
    executionTimeMs: int32;
    status: "success" | "error";
    error?: string;
    timestamp?: string;
  }
}
