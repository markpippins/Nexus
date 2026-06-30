/**
 * Export Service Models
 *
 * Export management entities and DTOs.
 * Maps to JVM package com.angrysurfer.shrapnel.export.
 */

namespace com.broker.shrapnel.export {

  // ─── Enums ──────────────────────────────────────────────

  /** Source from which exports originate */
  enum ExportSource {
    manual,
    scheduled,
  }

  /** Type of field (corresponds to DBFieldType entity) */
  enum FieldTypeEnum {
    text,
    numeric,
    date,
    boolean,
    lookup,
    computed,
  }

  /** Style type categories */
  enum StyleTypeEnum {
    header,
    data,
    title,
    footer,
    alternating,
  }

  /** Page size options for PDF export */
  enum PdfPageSize {
    A4,
    Letter,
    Legal,
    Tabloid,
    A3,
  }

  // ─── Entities ───────────────────────────────────────────

  /** Data source configuration */
  model DBDataSource {
    id?: int64;
    name: string;
    driver: string;
    url: string;
    username: string;
    /** Reference to an external credential store */
    passwordRef?: string;
  }

  /** Field type — maps display/format hints */
  model DBFieldType {
    id?: int64;
    name: FieldTypeEnum;
    displayPattern?: string;
    formatMask?: string;
  }

  /** Style type — controls how fields render */
  model StyleType {
    id?: int64;
    name: StyleTypeEnum;
    fontName?: string;
    fontSize?: int32;
    bold?: boolean = false;
    italic?: boolean = false;
    foreground?: string;
    background?: string;
  }

  /** Presentation style applied to fields */
  model Style {
    id?: int64;
    name: string;
    styleType: StyleType;
  }

  /** Field mapping within an export definition */
  model DBField {
    id?: int64;
    name: string;
    sourceColumn: string;
    displayName?: string;
    position: int32;
    required?: boolean = false;
    fieldType?: DBFieldType;
    style?: Style;
    exportId?: int64;
  }

  /** Export request entity */
  model DBExport {
    id?: int64;
    name: string;
    description?: string;
    source: ExportSource;
    pageSize: PdfPageSize = PdfPageSize.A4;
    pageOrientation: string = "portrait";
    dataSource: DBDataSource;
    fields: DBField[];
    createdAt?: utcDateTime;
    updatedAt?: utcDateTime;
    enabled?: boolean = true;
  }

  // ─── DTOs ───────────────────────────────────────────────

  /** Export request DTO */
  model ExportRequest {
    name: string;
    fileType: string;
    filterCriteria?: unknown;
  }

  /** Export response DTO */
  model ExportResponse {
    id: string;
    fileName: string;
    fileSize: int64;
    mimeType: string;
    generatedAt: utcDateTime;
  }

  /** Readiness check response */
  model ReadyResponse {
    ready: boolean;
    message?: string;
  }

  /** Target directory information */
  model TargetDirResponse {
    path: string;
    writable: boolean;
    freeSpace: int64;
  }
}
