package com.angrysurfer.shrapnel.repository;

import com.angrysurfer.shrapnel.model.DBExport;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExportRepository extends JpaRepository< DBExport, Long> {
    DBExport findByName(String name);
}
