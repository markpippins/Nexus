package com.angrysurfer.shrapnel.repository.style;

import com.angrysurfer.shrapnel.model.style.StyleType;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StyleTypeRepository extends JpaRepository< StyleType, Integer > {

	StyleType findByName(String name);
}
