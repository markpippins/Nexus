package com.angrysurfer.shrapnel.mapping;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collection;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.Objects;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.ResultSetExtractor;

import com.angrysurfer.shrapnel.field.FieldTypeEnum;
import com.angrysurfer.shrapnel.model.DBExport;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class HashMapResultSetExtractor implements ResultSetExtractor {

	private final DBExport export;

	boolean useTimeStampForLocalDate = true;

	public HashMapResultSetExtractor(DBExport export) {
		this.export = export;
	}

	@Override
	public Collection extractData(ResultSet rs) throws SQLException, DataAccessException {

		Collection< HashMap< String, Object > > results = new ArrayList();
		while (rs.next()) {
			HashMap< String, Object > values = new HashMap();

			export.getFields().forEach(field -> {
				try {
					switch (FieldTypeEnum.from(field.fieldType.getCode())) {
						case BOOLEAN:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								values.put(field.getPropertyName(), rs.getBoolean(field.getPropertyName()));
							break;

						case CALENDAR:
							if (Objects.nonNull(rs.getString(field.getPropertyName()))) {
								Calendar cal = new GregorianCalendar();
								cal.setTime(rs.getDate(field.getPropertyName()));
								values.put(field.getPropertyName(), cal);
							}
							break;

						case DATE:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								values.put(field.getPropertyName(), new Date(rs.getDate(field.getPropertyName()).getTime()));
							break;

						case DOUBLE:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								values.put(field.getPropertyName(), rs.getDouble(field.getPropertyName()));
							break;

						case LOCALDATE:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								values.put(field.getPropertyName(), rs.getDate(field.getPropertyName()).toLocalDate());
							break;

						case LOCALDATETIME:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								if (useTimeStampForLocalDate)
									values.put(field.getPropertyName(), rs.getTimestamp(field.getPropertyName()).toLocalDateTime());
								else
									values.put(field.getPropertyName(), rs.getDate(field.getPropertyName()).getTime());
							break;

						case RICHTEXT:

						case STRING:
							if (Objects.nonNull(rs.getString(field.getPropertyName())))
								values.put(field.getPropertyName(), rs.getString(field.getPropertyName()));
							break;
					}
				} catch (SQLException e) {
					log.error(e.getMessage(), e);
				}
			});

			results.add(values);
		}

		return results;
	}
}
