package com.aibizarchitect.nexus.v1.spring.fs.api;

import java.util.List;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class Mount {

    private String id;
    private String name;
    private String type;
    private boolean defaultMount;
    private List<String> rootPath;
}
