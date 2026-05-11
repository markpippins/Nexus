package com.aibizarchitect.nexus.v1.spring.fs.api;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Reference to a file or folder item for batch operations.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FsItemReference {
    private String name;
    private String type; // "file" | "folder"
}
