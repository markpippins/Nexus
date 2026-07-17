package com.aibizarchitect.nexus.v1.spring.social.model;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import com.aibizarchitect.nexus.v1.spring.social.PostDTO;
import com.aibizarchitect.nexus.v1.spring.social.PostStatDTO;

import jakarta.persistence.Column;
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
@Table(name = "posts", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Post extends AbstractContent {

    private static final long serialVersionUID = -6085955136753566931L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "posted_by_id", nullable = false)
    private User postedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "posted_to_id")
    private User postedTo;

    @Column(name = "forum_id")
    private Long forumId;

    @Column(name = "source_url", length = 1024)
    private String sourceUrl;

    @Column(name = "title", length = 512)
    private String title;

    @OneToMany(mappedBy = "post", fetch = FetchType.LAZY)
    private Set<Comment> replies = new HashSet<>();

    @OneToMany(mappedBy = "post", fetch = FetchType.LAZY)
    private Set<Edit> edits = new HashSet<>();

    @OneToMany(mappedBy = "post", fetch = FetchType.LAZY)
    private Set<Reaction> reactions = new HashSet<>();

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

    public PostDTO toDTO() {
        PostDTO dto = new PostDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setText(getText());
        dto.setPostedBy(getPostedBy() != null ? getPostedBy().getAlias() : null);
        dto.setForumId(getForumId());
        if (getPostedTo() != null) {
            dto.setPostedTo(getPostedTo().getAlias());
        }
        dto.setReplies(getReplies() == null ? new HashSet<>() :
            getReplies().stream().map(Comment::toDTO).collect(Collectors.toSet()));
        dto.setReactions(getReactions() == null ? new HashSet<>() :
            getReactions().stream().map(Reaction::toDTO).collect(Collectors.toSet()));
        return dto;
    }

    public PostStatDTO toStatDTO() {
        PostStatDTO dto = new PostStatDTO();
        dto.setId(getId() != null ? (long) getId().hashCode() : null);
        dto.setRating(getRating());
        return dto;
    }

    public Post(User postedBy, User postedTo, String text) {
        this.postedBy = postedBy;
        this.postedTo = postedTo;
        setText(text);
    }
}
