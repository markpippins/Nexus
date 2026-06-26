package com.angrysurfer.shrapnel.model.value;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Getter
@Setter
@Entity
@Table(name = "value_type", schema = "shrapnel")
public class ValueType {

	@Id
	@Column(name = "code", nullable = false)
	private Integer code;

	@Column(name = "table_name", nullable = false)
	private String tableName;
}
