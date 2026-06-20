package com.angrysurfer.shrapnel.factory;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.angrysurfer.shrapnel.mapping.HashMapResultSetExtractor;
import com.angrysurfer.shrapnel.model.DBExport;
import com.angrysurfer.shrapnel.model.db.DBDataSource;
import com.angrysurfer.shrapnel.repository.ExportRepository;
import com.angrysurfer.shrapnel.repository.db.DataSourceRepository;
import com.angrysurfer.shrapnel.service.Request;
import com.angrysurfer.shrapnel.util.FileUtil;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class JdbcTemplateMetaExportFactory implements IMetaExportFactory {

	private final JdbcTemplate jdbcTemplate;
	private final DataSourceRepository dataSourceRepository;
	private final ExportRepository exportRepository;

	    public JdbcTemplateMetaExportFactory(JdbcTemplate jdbcTemplate,									   DataSourceRepository dataSourceRepository,
									   ExportRepository exportRepository) {
		this.jdbcTemplate = jdbcTemplate;
		this.dataSourceRepository = dataSourceRepository;
		this.exportRepository = exportRepository;
	}


	@Override
	public boolean hasFactory(Request request) {
		DBExport export = exportRepository.findByName(request.getName());
		return Objects.nonNull(export) && export.isConfigured();
	}

	@Override
	public IExportFactory newInstance(Request request) {
		final DBExport     dbExport   = exportRepository.findByName(request.getName());
		final DBDataSource dataSource = dataSourceRepository.findByName(request.getName());

		return new JdbcTemplateExportFactory(request, dbExport) {

			@Override
			public Collection getData() {
				String sql = Objects.nonNull(dataSource.getScriptName()) ?
						             // load query from sql folder
						             // TODO: implement refreshable caching scheme for queries
						             FileUtil.getSQL(dataSource.getScriptName()) :
						             Objects.nonNull(dataSource.getQuery()) ?
								             // build query from db definition
								             dataSource.getQuery().getSQL() :
								             null;

				return Objects.nonNull(sql) ?
						       (Collection) jdbcTemplate.query(sql, new HashMapResultSetExtractor(dbExport)) :
						       Collections.EMPTY_LIST;
			}
		};
	}

	@Override
	public List< String > getAvailableExports() {
		List<DBExport> exports = exportRepository.findAll();
		return exports.stream().map(ex -> ex.getName()).collect(Collectors.toList());
	}
}
