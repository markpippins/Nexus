package com.angrysurfer.shrapnel.model.style;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Getter
@Setter
@Entity
@Table(name = "style_type", schema = "shrapnel")
public class StyleType {

	@Id
	@Column(name = "code", nullable = false)
	private Integer code;

	@Column(name = "name", nullable = false)
	private String name;
}
