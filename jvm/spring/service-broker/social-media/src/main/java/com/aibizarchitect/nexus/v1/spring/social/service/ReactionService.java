package com.aibizarchitect.nexus.v1.spring.social.service;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.aibizarchitect.nexus.v1.spring.social.model.Reaction;
import com.aibizarchitect.nexus.v1.spring.social.repository.ReactionRepository;

@Service
public class ReactionService {

    private static final Logger log = LoggerFactory.getLogger(ReactionService.class);
    private final ReactionRepository reactionRepository;

    public ReactionService(ReactionRepository reactionRepository) {
        this.reactionRepository = reactionRepository;
        log.info("ReactionService initialized");
    }

    public String delete(String reactionId) {
        log.info("Delete reaction id {}", reactionId);
        reactionRepository.deleteById(java.util.UUID.fromString(reactionId));
        return "redirect:/Reaction/all";
    }

    public Optional<Reaction> findById(String reactionId) {
        log.info("Find reaction by id {}", reactionId);
        return reactionRepository.findById(java.util.UUID.fromString(reactionId));
    }

    public Set<Reaction> findAll() {
        log.info("Find all reactions");
        HashSet<Reaction> result = new HashSet<>();
        reactionRepository.findAll().forEach(result::add);
        return result;
    }

    public Reaction save(Reaction n) {
        log.info("Save reaction {}", n.getId());
        return reactionRepository.save(n);
    }

    public void update(String id) {
        log.info("Update reaction id {}", id);
        reactionRepository.deleteById(java.util.UUID.fromString(id));
    }

}