package com.angrysurfer.shrapnel.repository.value;

import org.springframework.data.jpa.repository.JpaRepository;

import com.angrysurfer.shrapnel.model.value.StringValue;

public interface StringValueRepository extends JpaRepository< StringValue, Long > {
}
