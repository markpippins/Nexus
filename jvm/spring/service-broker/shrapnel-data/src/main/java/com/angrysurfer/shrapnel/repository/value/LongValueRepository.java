package com.angrysurfer.shrapnel.repository.value;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.value.LongValue;

public interface LongValueRepository extends JpaRepository< LongValue, Long > {
}
