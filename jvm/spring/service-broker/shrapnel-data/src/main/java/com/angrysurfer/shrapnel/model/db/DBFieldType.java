package com.angrysurfer.shrapnel.model.db;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "field_type", schema = "shrapnel")
public class DBFieldType {

	@Id
	@Column(name = "code", nullable = false)
	private Integer code;

	@Column(name = "name", nullable = false)
	private String name;
}
