package com.angrysurfer.shrapnel.repository.db;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.db.DBDataSource;

public interface DataSourceRepository extends JpaRepository< DBDataSource, Long> {
    DBDataSource findByName(String name);
}
