package com.angrysurfer.shrapnel.component.writer;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Objects;

import com.angrysurfer.shrapnel.field.Field;
import com.angrysurfer.shrapnel.field.FieldTypeEnum;
import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.field.IValueCalculator;
import com.angrysurfer.shrapnel.field.IValueFormatter;
import com.angrysurfer.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.property.IProxyPropertyAccessor;
import com.angrysurfer.shrapnel.property.PropertyUtilsPropertyAccessor;
import com.angrysurfer.shrapnel.writer.IDataWriter;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Setter
public abstract class DataWriter implements IDataWriter, IProxyPropertyAccessor {

    public static final boolean DEBUG = false;

    public static final String EMPTY_STRING = "";
    public static final String EMPTY_QUOTES = "''";

    public static final IField DATA_NULL_VALUE   = new Field.DebugField("dataNullValue", "<< NULL >>", FieldTypeEnum.STRING);
    public static final IField DATA_PADDING_LEFT = new Field.DebugField("dataPaddingLeft", "<< DATA <<", FieldTypeEnum.STRING);
    public static final IField DATA_PADDING_RIGHT = new Field.DebugField("dataPaddingRight", ">> DATA >>", FieldTypeEnum.STRING);
    public static final IField HEADER_PADDING_LEFT = new Field.DebugField("hdrPaddingLeft", "<< HDR <<", FieldTypeEnum.STRING);
    public static final IField HEADER_PADDING_RIGHT = new Field.DebugField("hdrPaddingRight", ">> HDR >>", FieldTypeEnum.STRING);

    public static List<IField> PADDING_COLUMNS = Arrays.asList(DATA_NULL_VALUE, DATA_PADDING_LEFT, DATA_PADDING_RIGHT,
            HEADER_PADDING_LEFT, HEADER_PADDING_RIGHT);

    private IPropertyAccessor propertyAccessor;

    private List<IField> fields;

    private IValueFormatter valueRenderer;

    private IValueCalculator valueCalculator;

    public DataWriter(List<IField> fields) {
        setPropertyAccessor(new PropertyUtilsPropertyAccessor());
        setFields(fields);
    }

    public DataWriter(List<IField> fields, IValueFormatter valueRenderer) {
        setPropertyAccessor(new PropertyUtilsPropertyAccessor());
        setFields(fields);
        setValueRenderer(valueRenderer);
    }

    public int getCellOffSet(Object item) {
        return 0;
    }

    public IValueCalculator getValueCalculator() {
        if (Objects.isNull(valueCalculator))
            valueCalculator = (field, item) -> item;

        return valueCalculator;
    }

    public IValueFormatter getValueRenderer() {
        if (Objects.isNull(valueRenderer))
            valueRenderer = new IValueFormatter() {

                @Override
                public boolean canRender(IField field) {
                    return false;
                }

                @Override
                public String renderCalculatedValue(IField field, Object value) {
                    return EMPTY_STRING;
                }
            };

        return valueRenderer;
    }

    public String getValue(Object item, IField field) {
        if (accessorExists(item, field.getPropertyName()) || field.getCalculated())
            switch (field.getType()) {
                case BOOLEAN:
                    Boolean bool = getBoolean(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, bool) :
                            extendedGetValue(item, field, bool);

                case CALENDAR:
                    Calendar calendar = getCalendar(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, calendar) :
                            extendedGetValue(item, field, calendar);

                case DATE:
                    Date date = getDate(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, date) :
                            extendedGetValue(item, field, date);

                case DOUBLE:
                    Double dbl = getDouble(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, dbl) :
                            extendedGetValue(item, field, dbl);

                case LOCALDATE:
                    LocalDate localDate = getLocalDate(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, localDate) :
                            extendedGetValue(item, field, localDate);

                case LOCALDATETIME:
                    LocalDateTime localDateTime = getLocalDateTime(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, localDateTime) :
                            extendedGetValue(item, field, localDateTime);

                case RICHTEXT:
                    break;

                case STRING:
                    String string = getString(item, field.getPropertyName());
                    return shouldOnlyRender(field) ?
                            getValueRenderer().render(field, string) :
                            extendedGetValue(item, field, string);
            }

        return EMPTY_STRING;
    }

    private String extendedGetValue(Object item, IField field, Object value) {
        return shouldOnlyCalculate(field) ?
                safeString(getValueCalculator().calculateValue(field, item)) :
                shouldCalculateAndRender(field) ?
                        getValueRenderer().renderCalculatedValue(field, safeString(getValueCalculator().calculateValue(field, item))) :
                        Objects.nonNull(value) ? value.toString() : EMPTY_STRING;
    }

    protected String safeString(Object value) {
        return Objects.nonNull(value) ? value.toString() : EMPTY_STRING;
    }

    protected boolean shouldCalculateAndRender(IField field) {
        return getValueRenderer().canRender(field) && field.getCalculated();
    }

    protected boolean shouldOnlyCalculate(IField field) {
        return field.getCalculated() && !getValueRenderer().canRender(field);
    }

    protected boolean shouldOnlyRender(IField field) {
        return !field.getCalculated() && getValueRenderer().canRender(field);
    }

    public boolean shouldSkip(IField field, Object item) {
        return Objects.isNull(field.getPropertyName());
    }

    public boolean shouldWrite(IField field, Object item) {
        return Objects.nonNull(field.getPropertyName());
    }
}
