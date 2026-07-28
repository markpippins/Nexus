package org.nexus.peb.hash.service;

import org.nexus.peb.domain.entity.PebDecision;
import org.nexus.peb.domain.entity.PebState;
import org.nexus.peb.domain.vo.PebStateHash;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Computes a deterministic Merkle-tree root hash over the system's PEB state
 * and latest decision, producing a single 64-char hex digest that changes
 * whenever any state key's checksum or the decision's afterHash changes.
 *
 * <h3>Algorithm</h3>
 * <ol>
 *   <li>Sort states by {@code key} for deterministic ordering.</li>
 *   <li>For each state, compute a leaf hash:
 *       {@code SHA-256(key + ":" + checksum)}.</li>
 *   <li>Build a Merkle tree bottom-up: pair consecutive leaf hashes,
 *       concatenate, and hash to produce parent nodes, repeating until
 *       a single root remains. Odd numbers at any level promote the
 *       unpaired hash without re-hashing.</li>
 *   <li>If a latest decision with a non-null {@code afterHash} is
 *       provided, fold it into the final root:
 *       {@code SHA-256(merkleRoot + ":" + decisionAfterHash)}.</li>
 *   <li>If states is null or empty and no decision hash is available,
 *       return {@code SHA-256("empty")} as the zero-state root.</li>
 * </ol>
 */
@Service
public class PebHashService {

    private static final String EMPTY_ROOT_INPUT = "empty";

    /**
     * Compute the Merkle root hash for the given state list and decision.
     *
     * @param states         the current PEB state entries (may be null or empty)
     * @param latestDecision the latest decision whose afterHash is folded in
     *                       (may be null; afterHash may be null)
     * @return a {@link PebStateHash} representing the system's integrity digest
     */
    public PebStateHash computeSystemHash(List<PebState> states,
                                           PebDecision latestDecision) {
        // ── Step 1: build the Merkle root from states ──
        String merkleRoot;
        if (states == null || states.isEmpty()) {
            merkleRoot = PebStateHash.compute(EMPTY_ROOT_INPUT).value();
        } else {
            // Sort by key for determinism
            List<PebState> sorted = new ArrayList<>(states);
            sorted.sort(Comparator.comparing(PebState::getKey,
                Comparator.nullsLast(Comparator.naturalOrder())));

            // Compute leaf hashes: SHA-256(key + ":" + checksum)
            List<String> level = new ArrayList<>();
            for (PebState s : sorted) {
                String key = s.getKey() != null ? s.getKey() : "";
                String checksum = s.getChecksum() != null ? s.getChecksum() : "";
                level.add(PebStateHash.compute(key + ":" + checksum).value());
            }

            // Bottom-up Merkle tree reduction
            while (level.size() > 1) {
                List<String> next = new ArrayList<>();
                for (int i = 0; i < level.size(); i += 2) {
                    if (i + 1 < level.size()) {
                        // Pair: hash(left + right)
                        next.add(PebStateHash.compute(
                            level.get(i) + level.get(i + 1)).value());
                    } else {
                        // Odd one out: promote unchanged
                        next.add(level.get(i));
                    }
                }
                level = next;
            }
            merkleRoot = level.get(0);
        }

        // ── Step 2: fold in the decision's afterHash if available ──
        if (latestDecision != null && latestDecision.getAfterHash() != null) {
            merkleRoot = PebStateHash.compute(
                merkleRoot + ":" + latestDecision.getAfterHash()).value();
        }

        // ── Step 3: validate and return ──
        return new PebStateHash(merkleRoot);
    }
}
