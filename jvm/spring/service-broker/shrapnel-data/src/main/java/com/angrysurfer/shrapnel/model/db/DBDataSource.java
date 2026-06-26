package com.angrysurfer.shrapnel.model.db;

import com.angrysurfer.shrapnel.model.sqlgen.Query;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "data_source", schema = "shrapnel_data")
public class DBDataSource {

	@ManyToOne
	@JoinColumn(name = "query_id", nullable = true)
	public Query query;

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@Column(name = "id", nullable = false)
	private Long id;

	@Column(name = "name", nullable = false)
	private String name;

	@Column(name = "scriptName", nullable = true)
	private String scriptName;
}
