package com.aibizarchitect.nexus.shrapnel.repository.db;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aibizarchitect.nexus.shrapnel.model.db.DBFieldType;

public interface FieldTypeRepository extends JpaRepository< DBFieldType, Integer> {

}
