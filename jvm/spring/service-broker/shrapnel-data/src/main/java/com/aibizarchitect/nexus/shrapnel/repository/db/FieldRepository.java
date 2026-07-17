package com.aibizarchitect.nexus.shrapnel.repository.db;

import com.aibizarchitect.nexus.shrapnel.model.db.DBField;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FieldRepository extends JpaRepository< DBField, Long> {

    DBField findByName(String name);
}
