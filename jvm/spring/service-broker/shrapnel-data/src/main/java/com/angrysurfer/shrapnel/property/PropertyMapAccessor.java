package com.angrysurfer.shrapnel.property;

import lombok.extern.slf4j.Slf4j;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Set;

@Slf4j
public class PropertyMapAccessor implements IPropertyAccessor {

	@Override
	public boolean accessorExists(Object item, String propertyName) {
		return ((HashMap) item).containsKey(propertyName);
	}

	@Override
	public Boolean getBoolean(Object item, String propertyName) {
		return (Boolean) ((HashMap) item).get(propertyName);
	}

	@Override
	public Double getDouble(Object item, String propertyName) {
		return (Double) ((HashMap) item).get(propertyName);
	}

	@Override
	public Calendar getCalendar(Object item, String propertyName) {
		return (Calendar) ((HashMap) item).get(propertyName);
	}

	@Override
	public Date getDate(Object item, String propertyName) {
		return (Date) ((HashMap) item).get(propertyName);
	}

	@Override
	public LocalDate getLocalDate(Object item, String propertyName) {
		return (LocalDate) ((HashMap) item).get(propertyName);
	}

	@Override
	public LocalDateTime getLocalDateTime(Object item, String propertyName) {
		return (LocalDateTime) ((HashMap) item).get(propertyName);
	}

	@Override
	public String getString(Object item, String propertyName) {
		return ((HashMap) item).get(propertyName).toString();
	}

	@Override
	public Set< String > getPropertyNames(Object item) {
		return ((HashMap) item).keySet();
	}

	@Override
	public void inspect(Object item) {
		getPropertyNames(item).forEach(propertyName -> {
			log.info(propertyName + " = " + getString(item, propertyName));
		});
	}

}
