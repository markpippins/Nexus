package com.angrysurfer.shrapnel.repository.db;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.db.DBFieldType;

public interface FieldTypeRepository extends JpaRepository< DBFieldType, Integer> {

}
