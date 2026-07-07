package com.aibizarchitect.nexus.v1.spring.social.model;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import com.aibizarchitect.nexus.v1.spring.social.CommentDTO;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "comments", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Comment extends AbstractContent {

    private static final long serialVersionUID = 1902851597891565438L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    protected Comment parent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "posted_by_id", nullable = false)
    private User postedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id")
    private Post post;

    @OneToMany(mappedBy = "parent", fetch = FetchType.LAZY)
    private Set<Comment> replies = new HashSet<>();

    @OneToMany(mappedBy = "comment", fetch = FetchType.LAZY)
    private Set<Reaction> reactions = new HashSet<>();

    @OneToMany(mappedBy = "comment", fetch = FetchType.LAZY)
    private Set<Edit> edits = new HashSet<>();

    @Override
    public Set<Edit> getEdits() {
        return edits;
    }

    @Override
    public Set<Reaction> getReactions() {
        return reactions;
    }

    @Override
    public Set<Comment> getReplies() {
        return replies;
    }

    public CommentDTO toDTO() {
        CommentDTO dto = new CommentDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setText(getText());
        dto.setPostedBy(getPostedBy() != null ? getPostedBy().getAlias() : null);
        dto.setPostId(getPost() != null ? getPost().getId().toString() : null);
        if (getParent() != null) {
            dto.setParentId(getParent().getId().toString());
        }
        dto.setReplies(getReplies() == null ? new HashSet<>() :
            getReplies().stream().map(Comment::toDTO).collect(Collectors.toSet()));
        dto.setReactions(getReactions() == null ? new HashSet<>() :
            getReactions().stream().map(Reaction::toDTO).collect(Collectors.toSet()));
        return dto;
    }

    public Comment(User user, String text) {
        setText(text);
        setPostedBy(user);
    }

    public Comment(User user, String text, Post post) {
        this(user, text);
        setPost(post);
    }

    public Comment(User user, String text, Comment parent) {
        this(user, text);
        setParent(parent);
    }
}
