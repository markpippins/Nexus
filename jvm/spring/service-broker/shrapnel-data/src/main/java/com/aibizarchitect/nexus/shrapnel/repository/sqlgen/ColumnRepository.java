package com.aibizarchitect.nexus.shrapnel.repository.sqlgen;

import com.aibizarchitect.nexus.shrapnel.model.sqlgen.Column;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ColumnRepository extends JpaRepository< Column, Long > {
}
