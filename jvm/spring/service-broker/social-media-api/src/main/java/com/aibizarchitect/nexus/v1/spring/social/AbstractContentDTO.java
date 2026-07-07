package com.aibizarchitect.nexus.v1.spring.social;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public abstract class AbstractContentDTO implements Serializable {

    /**
	 *
	 */
	private static final long serialVersionUID = 1L;

	private String id;

    private String postedBy;

    private String postedTo;

    private String postedDate;

    private String text;

    private Long rating;

    private String url;

    private Set<CommentDTO> replies = new HashSet<>();

    private Set<ReactionDTO> reactions = new HashSet<>();
}
