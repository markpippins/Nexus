package com.aibizarchitect.nexus.v1.spring.social.model;

import java.util.Set;
import java.util.UUID;

public interface IContent {

    UUID getId();

    Set<Edit> getEdits();

    User getPostedBy();

    String getPostedDate();

    Long getRating();

    Set<Reaction> getReactions();

    Set<Comment> getReplies();

    String getText();

    String getUrl();
}
