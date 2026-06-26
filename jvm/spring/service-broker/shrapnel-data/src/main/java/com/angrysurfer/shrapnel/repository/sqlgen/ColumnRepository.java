package com.angrysurfer.shrapnel.repository.sqlgen;

import com.angrysurfer.shrapnel.model.sqlgen.Column;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ColumnRepository extends JpaRepository< Column, Long > {
}
