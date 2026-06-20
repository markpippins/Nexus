package com.angrysurfer.shrapnel.filter;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.writer.IDataWriter;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Getter
@Setter
@Slf4j
public class StringFieldFilter implements IDataFilter {

    private static final String NULL = "null";

    private Map<String, Object> filterCriteria = new HashMap<>();

    public StringFieldFilter() {
    }

    public StringFieldFilter(Map<String, Object> filterCriteria) {
        setFilterCriteria(filterCriteria);
    }

    @Override
    public boolean allows(Object item, IDataWriter writer, IPropertyAccessor accessor) {
        boolean[] result = {Objects.nonNull(item)};

        if (result[0])
            getFilterCriteria().forEach((propertyName, criteria) -> {
                IField field = writer.getField(propertyName);
                if (Objects.isNull(criteria) || Objects.isNull(field))
                    throw new IllegalArgumentException();

                String propertyValue = null;

                switch (writer.getField(propertyName).getType()) {
                    case STRING:
                        propertyValue = accessor.getString(item, propertyName);
                }

                if ((Objects.isNull(propertyValue) && !asCriteriaString(criteria).equals("")) ||
                        !compare(propertyValue, criteria))
                    result[0] = false;

                log.info("allows({}) returning {} for criteria {}:{}", Objects.nonNull(propertyValue) ? propertyValue : "''", result[0], propertyName, propertyValue);
            });

        return result[0];
    }

    private String asCriteriaString(Object criteria) {
        return criteria.toString().replace("*", "").toLowerCase().trim();
    }

    private boolean compare(String propertyValue, Object criteria) {
        final String criteriaString = asCriteriaString(criteria);

        if (criteriaString.equalsIgnoreCase(NULL) && propertyValue == null)
            return true;

        if (criteria.toString().startsWith("*") && criteria.toString().endsWith("*"))
            return propertyValue.toLowerCase(Locale.ROOT).contains(criteriaString);

        if (criteria.toString().startsWith("*"))
            return propertyValue.toLowerCase(Locale.ROOT).endsWith(criteriaString);

        if (criteria.toString().endsWith("*"))
            return propertyValue.toLowerCase(Locale.ROOT).startsWith(criteriaString);

        return propertyValue.equalsIgnoreCase(criteriaString);
    }
}
