package com.angrysurfer.shrapnel.repository.sqlgen;

import com.angrysurfer.shrapnel.model.sqlgen.Join;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JoinRepository extends JpaRepository< Join, Long > {
}
