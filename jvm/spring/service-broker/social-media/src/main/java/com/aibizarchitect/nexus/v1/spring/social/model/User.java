package com.aibizarchitect.nexus.v1.spring.social.model;

import java.io.Serializable;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.aibizarchitect.nexus.v1.spring.social.UserDTO;

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
@Table(name = "users", schema = "assembly")
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(of = "id")
public class User implements Serializable {

    private static final long serialVersionUID = 2747813660378401172L;

    @Id
    @Column(name = "id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "identifier")
    private String identifier;

    @Column(name = "admin", nullable = false)
    private boolean admin = false;

    @Column(name = "alias", nullable = false, unique = true, length = 255)
    private String alias;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "avatar_url", length = 1024)
    private String avatarUrl = "https://picsum.photos/50/50";

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "user_followers",
        schema = "assembly",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "follower_id")
    )
    private Set<User> followers = new HashSet<>();

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "user_following",
        schema = "assembly",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "following_id")
    )
    private Set<User> following = new HashSet<>();

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "user_friends",
        schema = "assembly",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "friend_id")
    )
    private Set<User> friends = new HashSet<>();

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
    }

    public UserDTO toDTO() {
        UserDTO dto = new UserDTO();
        dto.setId(getId() != null ? getId().toString() : null);
        dto.setAlias(getAlias());
        dto.setEmail(getEmail());
        dto.setIdentifier(getIdentifier());
        dto.setAdmin(isAdmin());
        dto.setAvatarUrl(getAvatarUrl());
        dto.setFollowers(getFollowers() == null ? new HashSet<>() :
            getFollowers().stream().map(User::getAlias).collect(Collectors.toSet()));
        dto.setFollowing(getFollowing() == null ? new HashSet<>() :
            getFollowing().stream().map(User::getAlias).collect(Collectors.toSet()));
        dto.setFriends(getFriends() == null ? new HashSet<>() :
            getFriends().stream().map(User::getAlias).collect(Collectors.toSet()));
        return dto;
    }

    public User(String alias, String email, String avatarUrl) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
    }

    public User(String alias, String email, String avatarUrl, String identifier) {
        setAlias(alias);
        setEmail(email);
        setAvatarUrl(avatarUrl);
        setIdentifier(identifier);
    }
}
