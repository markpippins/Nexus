package com.angrysurfer.spring.nexus.fs.api;

import java.time.OffsetDateTime;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FsItem {

    private String name;
    private String type;
    private long size;
    private OffsetDateTime lastModified;
    private String lastModifiedDate;
    private String url;
    private String thumbnailUrl;
    private String deleteUrl;
    private String deleteType;
}
