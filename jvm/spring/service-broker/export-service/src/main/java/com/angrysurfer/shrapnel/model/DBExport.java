package com.angrysurfer.shrapnel.model;

import java.io.File;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import com.angrysurfer.shrapnel.PropertyConfig;
import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.model.db.DBDataSource;
import com.angrysurfer.shrapnel.model.db.DBField;
import com.angrysurfer.shrapnel.model.style.PdfPageSize;
import com.angrysurfer.shrapnel.model.style.Style;
import com.angrysurfer.shrapnel.model.style.StyleTypeEnum;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
@Entity
@Table(name = "export", schema = "shrapnel")
public class DBExport {

	@ManyToOne
	@JoinColumn(name = "data_source_id")
	public DBDataSource dataSource;

	@ManyToOne
	@JoinColumn(name = "page_size_id")
	public PdfPageSize pdfPageSize;

	@Id
	@GeneratedValue(strategy = GenerationType.AUTO)
	@Column(name = "id", nullable = false)
	private Long id;

	@Column(name = "name", nullable = false)
	private String name;

	@ManyToMany
	@JoinTable(
			name = "export_field",
			joinColumns = @JoinColumn(name = "field_id"),
			inverseJoinColumns = @JoinColumn(name = "export_id"))
	private Set< DBField > fields = new HashSet<>();

	@ManyToMany
	@JoinTable(
			name = "export_style",
			joinColumns = @JoinColumn(name = "style_id"),
			inverseJoinColumns = @JoinColumn(name = "export_id"))
	private Set< Style > styles = new HashSet<>();


	@Transient
	public boolean isConfigured() {

		final boolean[] isConfigured = { true };

		if (Objects.isNull(getName()) ||
				    (Objects.isNull(getDataSource()) && Objects.isNull(getDataSource().getScriptName())))
			isConfigured[ 0 ] = false;

		Map< Integer, IField > indexMap = new HashMap<>();
		getFields().forEach(field -> {
			if (Objects.isNull(field.getPropertyName())
//					    || indexMap.containsKey(field.getIndex())
					    || Objects.isNull(field.getType())
					    || Objects.isNull(field.getIndex()))
				isConfigured[ 0 ] = false;
//  			indexMap.put(field.getIndex(), field);
		});

		if (Objects.isNull(getDataSource().getQuery())) {
			File sql = new File(PropertyConfig.getInstance().getProperty(PropertyConfig.SQL_FOLDER) + getDataSource().getScriptName() + ".sql");
			if (!sql.exists())
				isConfigured[ 0 ] = false;
		}
		else if (Objects.isNull(getDataSource().getQuery().getSQL()))
			isConfigured[ 0 ] = false;

		return isConfigured[ 0 ];
	}

	@Transient
	public boolean hasCustomSize() {
		return getStyles().stream().filter(st -> Arrays.asList(StyleTypeEnum.HEIGHT, StyleTypeEnum.WIDTH)
						.contains(StyleTypeEnum.from(st.styleType.getCode())))
				.collect(Collectors.toList()).size() == 2;
	}

	// TODO: implement star model such that all primitive style values can be saved to db
	public float getCustomWidth() {
		return 0;
	}

	public float getCustomHeight() {
		return 0;
	}
}
