package com.aibizarchitect.nexus.shrapnel.model.sqlgen;

import lombok.Getter;
import lombok.Setter;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Getter
@Setter
@Entity
@jakarta.persistence.Table(name = "qbe_join_type", schema = "shrapnel")
public class JoinType {

	@Id
	@jakarta.persistence.Column(name = "code", nullable = false)
	private Integer code;

	@jakarta.persistence.Column(name = "name", nullable = false)
	private String name;
}
