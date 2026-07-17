package com.aibizarchitect.nexus.v1.spring.social;

import java.io.Serializable;


import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ReactionDTO implements Serializable {

    /**
     *
     */
    private static final long serialVersionUID = -2161409918544474273L;

    private String id;

    private String type;

    private String alias;
}
