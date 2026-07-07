package com.aibizarchitect.nexus.v1.spring.social;

import lombok.Data;

@Data
public class CommentDTO extends AbstractContentDTO {

    private String postId;

    private String parentId;

    public CommentDTO() {
        super();
    }
}
