package org.nexus.peb.hash.service;

import org.nexus.peb.domain.entity.PebDecision;
import org.nexus.peb.domain.entity.PebState;
import org.nexus.peb.domain.vo.PebStateHash;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PebHashService {

    public PebStateHash computeSystemHash(List<PebState> states, PebDecision latestDecision) {
        // Implementation for Merkle tree builder
        // For now, this is a stub that returns a placeholder hash
        return PebStateHash.compute("placeholder-hash-logic");
    }
}
