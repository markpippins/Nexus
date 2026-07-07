package com.aibizarchitect.nexus.shrapnel.repository.sqlgen;

import com.aibizarchitect.nexus.shrapnel.model.sqlgen.Join;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JoinRepository extends JpaRepository< Join, Long > {
}
