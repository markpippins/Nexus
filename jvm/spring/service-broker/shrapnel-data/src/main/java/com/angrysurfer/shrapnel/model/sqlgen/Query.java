package com.angrysurfer.shrapnel.model.sqlgen;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import jakarta.persistence.Column;
import jakarta.persistence.*;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Getter
@Setter
@Entity
@Table(name = "qbe_query", schema = "shrapnel_data")
public class Query {

	public static String SELECT = "\n\tSELECT \n\t";

	public static String FROM = " \t\n\tFROM \n\t";

	public static String WHERE = " \t\n\tWHERE \n\t";

	public static String AND = " AND ";

	private static String EQUALS = " = ";

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@jakarta.persistence.Column(name = "id", nullable = false)
	private Long id;

	@jakarta.persistence.Column(name = "name", nullable = false)
	private String name;

	@Column(name = "schema_name", nullable = false)
	private String schema;

	@OneToMany(fetch = FetchType.EAGER)
	@JoinTable(name = "qbe_query_column", joinColumns = { @JoinColumn(name = "query_id") }, inverseJoinColumns = {
			@JoinColumn(name = "column_id") })
	private Set< com.angrysurfer.shrapnel.model.sqlgen.Column > columns = new HashSet<>();

	@OneToMany(fetch = FetchType.EAGER)
	@JoinTable(name = "qbe_query_join", joinColumns = { @JoinColumn(name = "query_id") }, inverseJoinColumns = {
			@JoinColumn(name = "join_id") })
	private Set< Join > joins = new HashSet<>();

	@Transient
	public String getSQL() {
		StringBuffer sql = new StringBuffer();
		sql.append(getSelect());
		sql.append(getFrom());
		sql.append(getWhere());
		log.info("returning \n{}\n", sql.toString());
		return sql.toString();
	}

	private String getSelect() {
		StringBuffer select = new StringBuffer(SELECT);
		select.append("\t");
		select.append(String.join(",\n\t\t", getColumns().stream()
				.sorted((c1, c2) -> c1.getTable().getName().compareTo(c2.getTable().getName()))
				.map(c -> getTableName(c, false) + "." + c.getName()).collect(Collectors.toList())));
		return select.toString();
	}


	private String getFrom() {
		StringBuffer from = new StringBuffer(FROM);
		from.append("\t");
		from.append(String.join(",\n\t\t", getColumns().stream()
				.sorted((c1, c2) -> c1.getTable().getName()
						.compareTo(c2.getTable().getName()))
				.map(c -> getTableName(c, true))
				.distinct()
				.collect(Collectors.toList())));

		return from.toString();
	}

	private String getWhere() {
		if (getJoins().size() == 0)
			return "\n";

		StringBuffer where = new StringBuffer(WHERE);
		where.append(String.join(AND, getJoins().stream()
				.sorted((j1, j2) -> j1.getJoinColumnA().getTable().getName()
						.compareTo(j2.getJoinColumnB().getTable().getName()))
				.map(j -> getComparisonSQL(j)).collect(Collectors.toList())));

		return where.toString();
	}

	private String getComparisonSQL(Join join) {
		// switch(join.getTye())
		return getEqualsStatement(join);
	}

	private String getEqualsStatement(Join join) {
		StringBuffer equals = new StringBuffer();
		equals.append("\t");
		equals.append(getTableName(join.getJoinColumnA(), false));
		equals.append(".");
		equals.append(join.getJoinColumnA().getName());
		equals.append(EQUALS);
		equals.append(getTableName(join.getJoinColumnB(), false));
		equals.append(".");
		equals.append(join.getJoinColumnB().getName());
		return equals.toString();
	}

	private String getTableName(com.angrysurfer.shrapnel.model.sqlgen.Column column, boolean prefix) {
		return prefix ? column.getTable().getSchema() + "." + column.getTable().getName() + " " +
				                column.getTable().getName().replace("_", "") + "_" :
				       column.getTable().getName().replace("_", "") + "_";
	}
}

