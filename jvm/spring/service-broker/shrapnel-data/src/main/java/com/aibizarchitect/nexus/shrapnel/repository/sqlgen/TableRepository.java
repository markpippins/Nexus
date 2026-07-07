package com.aibizarchitect.nexus.shrapnel.repository.sqlgen;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aibizarchitect.nexus.shrapnel.model.sqlgen.Table;

public interface TableRepository extends JpaRepository< Table, Long > {
}
