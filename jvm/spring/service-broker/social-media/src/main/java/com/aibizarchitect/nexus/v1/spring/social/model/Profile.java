package com.aibizarchitect.nexus.v1.spring.social.model;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import com.aibizarchitect.nexus.v1.spring.social.ProfileDTO;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "profiles", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(of = "id")
public class Profile implements Serializable {

    private static final long serialVersionUID = 6188258652004048094L;

    @Id
    @Column(name = "id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "first_name", length = 255)
    private String firstName;

    @Column(name = "last_name", length = 255)
    private String lastName;

    @Column(name = "city", length = 255)
    private String city;

    @Column(name = "state", length = 255)
    private String state;

    @Column(name = "profile_image_url", length = 1024)
    private String profileImageUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true)
    private User user;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "profile_interests",
        schema = "assembly",
        joinColumns = @JoinColumn(name = "profile_id"),
        inverseJoinColumns = @JoinColumn(name = "interest_id")
    )
    private Set<Interest> interests = new HashSet<>();

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
    }

    public ProfileDTO toDTO() {
        ProfileDTO dto = new ProfileDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setFirstName(getFirstName());
        dto.setLastName(getLastName());
        dto.setCity(getCity());
        dto.setState(getState());
        dto.setProfileImageUrl(getProfileImageUrl());
        if (getInterests() != null) {
            getInterests().forEach(interest -> dto.getInterests().add(interest.getName()));
        }
        return dto;
    }
}
