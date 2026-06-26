package com.angrysurfer.shrapnel.repository.sqlgen;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.sqlgen.Table;

public interface TableRepository extends JpaRepository< Table, Long > {
}
