package com.angrysurfer.spring.nexus.fs.api;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class FsItem {

    private String name;
    private String type;
    private long size;
    private double lastModified;
    private String lastModifiedDate;
    private String url;
    private String thumbnailUrl;
    private String deleteUrl;
    private String deleteType;
}
