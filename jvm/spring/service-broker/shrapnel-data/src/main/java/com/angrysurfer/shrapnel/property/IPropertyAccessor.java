package com.angrysurfer.shrapnel.property;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Calendar;
import java.util.Date;
import java.util.Set;

public interface IPropertyAccessor {

    boolean accessorExists(Object item, String propertyName);

    Boolean getBoolean(Object item, String propertyName);

    Double getDouble(Object item, String propertyName);

    Calendar getCalendar(Object item, String propertyName);

    Date getDate(Object item, String propertyName);

    LocalDate getLocalDate(Object item, String propertyName);

    LocalDateTime getLocalDateTime(Object item, String propertyName);

    //    RichText getRichTextValue(Object item, String propertyName);

    String getString(Object item, String propertyName);

    Set<String> getPropertyNames(Object item);

    void inspect(Object value);
}
