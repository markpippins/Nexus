package com.angrysurfer.shrapnel.repository.value;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.sqlgen.Join;

public interface ValueRepository extends JpaRepository< Join, Long > {
}
