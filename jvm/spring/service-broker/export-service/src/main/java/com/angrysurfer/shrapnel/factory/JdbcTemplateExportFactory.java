package com.angrysurfer.shrapnel.factory;

import java.util.Comparator;
import java.util.Objects;
import java.util.stream.Collectors;

import com.angrysurfer.shrapnel.Export;
import com.angrysurfer.shrapnel.IExport;
import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.model.DBExport;
import com.angrysurfer.shrapnel.property.PropertyMapAccessor;
import com.angrysurfer.shrapnel.service.Request;
import com.itextpdf.kernel.geom.PageSize;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Getter
@Slf4j
public class JdbcTemplateExportFactory implements IExportFactory {

	private Request request;

	private DBExport dbExport;

	public JdbcTemplateExportFactory(Request request, DBExport dbExport) {
		this.request  = request;
		this.dbExport = dbExport;
	}

	@Override
	public String getExportName() {
		return request.getName();
	}

	@Override
	public IExport newInstance() {
		PageSize pageSize = getPageSize(getDbExport());

		return new Export(getExportName(), getDbExport().getFields()
				.stream()
				.sorted(Comparator.comparing(IField::getIndex))
				.collect(Collectors.toList())) {

			@Override
			public PageSize getPdfPageSize() {
				return pageSize;
			}

			@Override
			public void init() {
				setPropertyAccessor(new PropertyMapAccessor());
			}
		};
	}

	static PageSize getPageSize(DBExport export) {
		return Objects.nonNull(export.getPdfPageSize()) ?
				               new PageSize(export.getPdfPageSize().getWidth(), export.getPdfPageSize().getHeight()) :
				               export.hasCustomSize() ?
						               new PageSize(export.getCustomWidth(), export.getCustomHeight()) :
						               PageSize.LETTER;

	}
}
