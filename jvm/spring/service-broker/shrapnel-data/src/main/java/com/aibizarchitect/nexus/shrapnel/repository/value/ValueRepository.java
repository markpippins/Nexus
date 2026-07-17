package com.aibizarchitect.nexus.shrapnel.repository.value;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aibizarchitect.nexus.shrapnel.model.sqlgen.Join;

public interface ValueRepository extends JpaRepository< Join, Long > {
}
