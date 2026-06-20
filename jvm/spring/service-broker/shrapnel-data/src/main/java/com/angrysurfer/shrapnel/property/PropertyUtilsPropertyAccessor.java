package com.angrysurfer.shrapnel.property;

import java.beans.PropertyDescriptor;
import java.lang.reflect.InvocationTargetException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.commons.beanutils2.PropertyUtils;

import com.angrysurfer.shrapnel.exception.ShrapnelException;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class PropertyUtilsPropertyAccessor implements IPropertyAccessor {

	private static final String QUALIFIER = ".";

	private static final String ESC_QUALIFIER = "\\.";

	@Override
	public boolean accessorExists(Object obj, String propertyName) {
		boolean result       = false;
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			result = Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod());
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}

		return result;
	}

	@Override
	public Boolean getBoolean(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof Boolean)
					return (Boolean) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public Double getDouble(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof Double)
					return (Double) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public Calendar getCalendar(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof Calendar)
					return (Calendar) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public Date getDate(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof Date)
					return (Date) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public LocalDate getLocalDate(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof LocalDate)
					return (LocalDate) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public LocalDateTime getLocalDateTime(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value) && value instanceof LocalDateTime)
					return (LocalDateTime) value;
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public String getString(Object obj, String propertyName) {
		Object item = propertyName.contains(QUALIFIER) ? getChildWithProperty(obj, propertyName) : obj;
		String property = propertyName.contains(QUALIFIER) ? getTrailingNameSegment(propertyName) : propertyName;
		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(item, property);
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod())) {
				Object value = desc.getReadMethod().invoke(item);
				if (Objects.nonNull(value))
					return value.toString();
			}
		}
		catch (InvocationTargetException | IllegalAccessException | NoSuchMethodException e) {
			log.error(e.getMessage(), e);
		}
		return null;
	}

	@Override
	public Set< String > getPropertyNames(Object item) {
		return Arrays.stream(PropertyUtils.getPropertyDescriptors(item)).map(desc -> desc.getName()).collect(Collectors.toSet());
	}

	@Override
	public void inspect(Object item) {
		getPropertyNames(item).forEach(property -> {
			log.info(property + " = " + getString(item, property));
		});
	}

	private String getLeadingNameSegment(String property) {
		return property.contains(QUALIFIER) ? property.split(ESC_QUALIFIER)[ 0 ] : property;
	}

	private String getTrailingNameSegment(String property) {
		return property.contains(QUALIFIER) ? property.split(ESC_QUALIFIER)[ property.split(ESC_QUALIFIER).length - 1 ] : property;
	}

	private String stripLeadingNameSegment(String property) {
		return String.join(QUALIFIER, Arrays.copyOfRange(property.split(ESC_QUALIFIER), 1, property.split(ESC_QUALIFIER).length));
	}

	private Object getChildWithProperty(Object obj, String property) {
		if (!property.contains(QUALIFIER))
			return obj;

		try {
			PropertyDescriptor desc = PropertyUtils.getPropertyDescriptor(obj, getLeadingNameSegment(property));
			if (Objects.nonNull(desc) && Objects.nonNull(desc.getReadMethod()) && Objects.nonNull(desc.getReadMethod().invoke(obj))) {
				Object child   = desc.getReadMethod().invoke(obj);
				String remnant = stripLeadingNameSegment(property);
				return (remnant.contains(QUALIFIER)) ? getChildWithProperty(child, remnant) : child;
			}
		}
		catch (IllegalArgumentException | IllegalAccessException | InvocationTargetException | NoSuchMethodException e) {
			throw new ShrapnelException(e.getMessage(), e);
		}

		return null;
	}
}
