package com.aibizarchitect.nexus.v1.spring.fs.api;

import java.util.List;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Generic response for file system operations.
 * Different operations populate different fields.
 */
@Data
@NoArgsConstructor
public class FsOperationResponse {
    // For list/cd operations
    private List<String> path;
    private List<FsItem> items;

    // For mkdir
    private String created;

    // For rmdir
    private String deleted;

    // For newfile
    private String createdFile;

    // For deletefile
    private String deletedFile;

    // For rename
    private String renamed;
    private String to;

    // For copy
    private String copied;

    // For move
    private String moved;

    // For hasfile/hasfolder
    private Boolean exists;
    private String type;
}
