package com.angrysurfer.shrapnel.property;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Calendar;
import java.util.Date;
import java.util.Set;

public interface IProxyPropertyAccessor extends IPropertyAccessor {

	IPropertyAccessor getPropertyAccessor();

	void setPropertyAccessor(IPropertyAccessor propertyAccessor);

	default boolean accessorExists(Object item, String propertyName) {
		return getPropertyAccessor().accessorExists(item, propertyName);
	}

	default Boolean getBoolean(Object item, String propertyName) {
		return getPropertyAccessor().getBoolean(item, propertyName);
	}

	default Double getDouble(Object item, String propertyName) {
		return getPropertyAccessor().getDouble(item, propertyName);
	}

	default Calendar getCalendar(Object item, String propertyName) {
		return getPropertyAccessor().getCalendar(item, propertyName);
	}

	default Date getDate(Object item, String propertyName) {
		return getPropertyAccessor().getDate(item, propertyName);
	}

	default LocalDate getLocalDate(Object item, String propertyName) {
		return getPropertyAccessor().getLocalDate(item, propertyName);
	}

	default LocalDateTime getLocalDateTime(Object item, String propertyName) {
		return getPropertyAccessor().getLocalDateTime(item, propertyName);
	}

	default String getString(Object item, String propertyName) {
		return getPropertyAccessor().getString(item, propertyName);
	}

	default Set< String > getPropertyNames(Object item) {
		return getPropertyAccessor().getPropertyNames(item);
	}

	default void inspect(Object value) {
		getPropertyAccessor().inspect(value);
	}
}
