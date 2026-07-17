package com.aibizarchitect.nexus.v1.spring.social.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import com.aibizarchitect.nexus.v1.spring.social.ReactionDTO;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "reactions", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(of = "id")
public class Reaction implements Serializable {

    private static final long serialVersionUID = -2157436062288147245L;

    public enum ReactionType {
        LIKE, LOVE, ANGER, SADNESS, SURPRISE
    }

    @Id
    @Column(name = "id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "created")
    private LocalDateTime created;

    @Enumerated(EnumType.STRING)
    @Column(name = "reaction_type", nullable = false, length = 50)
    private ReactionType reactionType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id")
    private Post post;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comment_id")
    private Comment comment;

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (created == null) {
            created = LocalDateTime.now();
        }
    }

    public ReactionDTO toDTO() {
        ReactionDTO dto = new ReactionDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setType(getReactionType() != null ? getReactionType().toString() : null);
        dto.setAlias(getUser() != null ? getUser().getAlias() : null);
        return dto;
    }

    public Reaction(User user, ReactionType type) {
        this.user = user;
        this.reactionType = type;
    }
}
