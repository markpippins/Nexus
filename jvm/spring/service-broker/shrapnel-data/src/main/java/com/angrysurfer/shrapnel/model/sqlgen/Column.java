package com.angrysurfer.shrapnel.model.sqlgen;

import lombok.Getter;
import lombok.Setter;

import com.angrysurfer.shrapnel.model.db.DBFieldType;

import jakarta.persistence.*;

@Getter
@Setter
@Entity
@jakarta.persistence.Table(name = "qbe_column", schema = "shrapnel")
public class Column {

	@ManyToOne
	@JoinColumn(name = "field_type_id")
	public DBFieldType fieldType;

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@jakarta.persistence.Column(name = "id", nullable = false)
	private Long id;

	@jakarta.persistence.Column(name = "name", nullable = false)
	private String name;

	@ManyToOne
	@JoinColumn(name = "table_id")
	private com.angrysurfer.shrapnel.model.sqlgen.Table table;

	@jakarta.persistence.Column(name = "field_index", nullable = false)
	private Integer index;

}
