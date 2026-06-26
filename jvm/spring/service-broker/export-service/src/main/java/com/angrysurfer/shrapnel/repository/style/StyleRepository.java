package com.angrysurfer.shrapnel.repository.style;

import com.angrysurfer.shrapnel.model.db.DBField;
import com.angrysurfer.shrapnel.model.style.Style;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StyleRepository extends JpaRepository< Style, Long > {

	DBField findByName(String name);
}
