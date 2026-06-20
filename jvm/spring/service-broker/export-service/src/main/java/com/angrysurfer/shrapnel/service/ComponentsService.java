package com.angrysurfer.shrapnel.service;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.angrysurfer.shrapnel.field.FieldTypeEnum;
import com.angrysurfer.shrapnel.model.DBExport;
import com.angrysurfer.shrapnel.model.db.DBDataSource;
import com.angrysurfer.shrapnel.model.db.DBField;
import com.angrysurfer.shrapnel.model.db.DBFieldType;
import com.angrysurfer.shrapnel.model.sqlgen.JoinType;
import com.angrysurfer.shrapnel.model.sqlgen.JoinTypeEnum;
import com.angrysurfer.shrapnel.model.sqlgen.Query;
import com.angrysurfer.shrapnel.model.style.StyleType;
import com.angrysurfer.shrapnel.model.style.StyleTypeEnum;
import com.angrysurfer.shrapnel.repository.ExportRepository;
import com.angrysurfer.shrapnel.repository.db.DataSourceRepository;
import com.angrysurfer.shrapnel.repository.db.FieldRepository;
import com.angrysurfer.shrapnel.repository.db.FieldTypeRepository;
import com.angrysurfer.shrapnel.repository.sqlgen.ColumnRepository;
import com.angrysurfer.shrapnel.repository.sqlgen.JoinRepository;
import com.angrysurfer.shrapnel.repository.sqlgen.JoinTypeRepository;
import com.angrysurfer.shrapnel.repository.sqlgen.QueryRepository;
import com.angrysurfer.shrapnel.repository.sqlgen.TableRepository;
import com.angrysurfer.shrapnel.repository.style.PdfPageSizeRepository;
import com.angrysurfer.shrapnel.repository.style.StyleTypeRepository;

@Service
public class ComponentsService {

	private final FieldRepository fieldRepository;
	private final DataSourceRepository dataSourceRepository;
	private final ExportRepository exportRepository;
	private final FieldTypeRepository fieldTypeRepository;
	private final JoinTypeRepository joinTypeRepository;
	private final StyleTypeRepository styleTypeRepository;
	private final PdfPageSizeRepository pdfPageSizeRepository;
	private final TableRepository tableRepository;
	private final ColumnRepository columnRepository;
	private final QueryRepository queryRepository;
	private final JoinRepository joinRepository;

	    public ComponentsService(FieldRepository fieldRepository,						   DataSourceRepository dataSourceRepository,
						   ExportRepository exportRepository,
						   FieldTypeRepository fieldTypeRepository,
						   JoinTypeRepository joinTypeRepository,
						   StyleTypeRepository styleTypeRepository,
						   PdfPageSizeRepository pdfPageSizeRepository,
						   TableRepository tableRepository,
						   ColumnRepository columnRepository,
						   QueryRepository queryRepository,
						   JoinRepository joinRepository) {
		this.fieldRepository = fieldRepository;
		this.dataSourceRepository = dataSourceRepository;
		this.exportRepository = exportRepository;
		this.fieldTypeRepository = fieldTypeRepository;
		this.joinTypeRepository = joinTypeRepository;
		this.styleTypeRepository = styleTypeRepository;
		this.pdfPageSizeRepository = pdfPageSizeRepository;
		this.tableRepository = tableRepository;
		this.columnRepository = columnRepository;
		this.queryRepository = queryRepository;
		this.joinRepository = joinRepository;
	}


	public DBDataSource createDataSource(Query query) {
		DBDataSource ds = new DBDataSource();
		ds.setName(query.getName());
		ds.setQuery(query);
		dataSourceRepository.save(ds);
		return ds;
	}

	public DBExport createExport(Query query) {
		DBExport export = new DBExport();
		export.setName(query.getName());
		export.setFields(createFields(query));
		export.setDataSource(createDataSource(query));
		exportRepository.save(export);
		return export;
	}

	public DBField createField(String name, String propertyName, String label, Integer index) {
		DBField field = new DBField();
		field.setName(name);
		field.setPropertyName(propertyName);
		field.setLabel(label);
		field.setIndex(index);
		field.setFieldType(fieldTypeRepository
				.findById(Integer.valueOf(FieldTypeEnum.STRING.getCode()))
				.orElseThrow(() -> new IllegalArgumentException()));
		fieldRepository.save(field);
		return field;
	}

	public Set< DBField > createFields(Query query) {
		Set< DBField > fields = new HashSet<>();
		query.getColumns().forEach(column -> fields.add(createField(column.getName(), column.getName(),
				column.getName().toUpperCase(Locale.ROOT), column.getIndex())));
		return fields;
	}

	public DBFieldType createFieldType(FieldTypeEnum fieldType) {
		DBFieldType ft = new DBFieldType();
		ft.setName(fieldType.name());
		ft.setCode(fieldType.getCode());
		fieldTypeRepository.save(ft);
		return ft;
	}

	public JoinType createJoinType(JoinTypeEnum joinType) {
		JoinType jt = new JoinType();
		jt.setName(joinType.name());
		jt.setCode(joinType.getCode());
		joinTypeRepository.save(jt);
		return jt;
	}

	public StyleType createStyleType(StyleTypeEnum styleType) {
		StyleType st = new StyleType();
		st.setName(styleType.name());
		st.setCode(styleType.getCode());
		styleTypeRepository.save(st);
		return st;
	}

}
