/**
 * Note Service Models
 *
 * Maps to JVM package com.aibizarchitect.nexus.v1.spring.note.
 * Data-only module — no HTTP surface.
 */

namespace com.aibizarchitect.nexus.v1.spring.note {

  /** A note. */
  model Note {
    id?: string;
    userId?: string;
    source?: string;
    key?: string;
    content?: string;
  }
}
