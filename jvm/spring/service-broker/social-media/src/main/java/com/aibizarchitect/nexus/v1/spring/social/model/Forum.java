package com.aibizarchitect.nexus.v1.spring.social.model;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.aibizarchitect.nexus.v1.spring.social.ForumDTO;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "forums", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(of = "id")
public class Forum implements Serializable {

    private static final long serialVersionUID = 2527484659765374240L;

    @Id
    @Column(name = "id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "name", nullable = false, unique = true, length = 255)
    private String name;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "forum_members",
        schema = "assembly",
        joinColumns = @JoinColumn(name = "forum_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> members = new HashSet<>();

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
    }

    public ForumDTO toDTO() {
        ForumDTO dto = new ForumDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setName(getName());
        if (getMembers() != null) {
            getMembers().forEach(member -> dto.getMembers().add(member.toDTO()));
        }
        return dto;
    }

    public Forum(String name) {
        this.name = name;
    }

    public void addMember(User user) {
        if (this.members == null) {
            this.members = new HashSet<>();
        }
        this.members.add(user);
    }
}
