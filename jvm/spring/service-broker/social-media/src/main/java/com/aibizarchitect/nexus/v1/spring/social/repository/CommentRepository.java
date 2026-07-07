package com.aibizarchitect.nexus.v1.spring.social.repository;

import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.aibizarchitect.nexus.v1.spring.social.model.Comment;

@Repository
public interface CommentRepository extends JpaRepository<Comment, UUID> {

    Set<Comment> findByPost_Id(UUID postId);

    Page<Comment> findByPost_Id(UUID postId, Pageable pageable);

    Page<Comment> findByPostedBy_Id(UUID userId, Pageable pageable);
}
