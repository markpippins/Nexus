package com.angrysurfer.shrapnel.repository.sqlgen;

import com.angrysurfer.shrapnel.model.sqlgen.Query;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QueryRepository extends JpaRepository< Query, Long > {
}
