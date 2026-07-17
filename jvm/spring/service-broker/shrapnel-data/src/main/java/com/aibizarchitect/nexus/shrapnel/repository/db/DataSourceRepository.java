package com.aibizarchitect.nexus.shrapnel.repository.db;

import org.springframework.data.jpa.repository.JpaRepository;

import com.aibizarchitect.nexus.shrapnel.model.db.DBDataSource;

public interface DataSourceRepository extends JpaRepository< DBDataSource, Long> {
    DBDataSource findByName(String name);
}
