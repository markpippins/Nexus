package com.aibizarchitect.nexus.v1.spring.social;

import lombok.Data;

@Data
public class PostDTO extends AbstractContentDTO {

    /**
     *
     */
    private static final long serialVersionUID = 1L;

    private Long forumId;

    public PostDTO() {
        super();
    }
}
