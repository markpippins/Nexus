package com.aibizarchitect.nexus.shrapnel.repository.sqlgen;

import com.aibizarchitect.nexus.shrapnel.model.sqlgen.Query;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QueryRepository extends JpaRepository< Query, Long > {
}
