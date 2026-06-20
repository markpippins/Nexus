package com.angrysurfer.shrapnel.component.writer.style.provider;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.component.writer.style.adapter.CellStyleAdapter;
import com.angrysurfer.shrapnel.component.writer.style.adapter.HeaderCellStyleAdapter;
import com.angrysurfer.shrapnel.component.writer.style.adapter.StyleAdapter;
import lombok.Getter;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

@Getter
@Setter
public class StyleProvider implements IStyleProvider {

    private boolean applyDefaultStyles = true;

    private StyleAdapter defaultCellStyleAdapter;
    private StyleAdapter defaultHeaderStyleAdapter;

    private Map< IField, StyleAdapter> cellStyles   = new HashMap<>();
    private Map<IField, StyleAdapter>  headerStyles = new HashMap<>();

    @Override
    public StyleAdapter getCellStyle(Object item, IField field, int row) {
        if (Objects.nonNull(field) && cellStyles.containsKey(field))
            return cellStyles.get(field);

        if (Objects.nonNull(field) && !cellStyles.containsKey(field)) {
            StyleAdapter result = new CellStyleAdapter();

            if (Objects.nonNull(this.defaultCellStyleAdapter))
                result.absorb(this.defaultCellStyleAdapter);

            cellStyles.put(field, result);
            return result;
        }

        if (Objects.isNull(defaultCellStyleAdapter))
            defaultCellStyleAdapter = new CellStyleAdapter();

        return defaultCellStyleAdapter;
    }

    public StyleAdapter getDefaultCellStyleAdapter() {
        if (Objects.isNull(defaultCellStyleAdapter))
            defaultCellStyleAdapter = new CellStyleAdapter();

        return defaultCellStyleAdapter;
    }

    public StyleAdapter getDefaultHeaderStyleAdapter() {
        if (Objects.isNull(defaultHeaderStyleAdapter))
            defaultHeaderStyleAdapter = new CellStyleAdapter();

        return defaultHeaderStyleAdapter;
    }

    @Override
    public StyleAdapter getHeaderStyle(IField field) {
        if (Objects.nonNull(field) && headerStyles.containsKey(field))
            return headerStyles.get(field);

        if (Objects.nonNull(field) && !headerStyles.containsKey(field)) {
            StyleAdapter result = new HeaderCellStyleAdapter();

            if (Objects.nonNull(this.defaultHeaderStyleAdapter))
                result.absorb(this.defaultHeaderStyleAdapter);

            headerStyles.put(field, result);
            return result;
        }

        if (Objects.isNull(defaultHeaderStyleAdapter))
            defaultHeaderStyleAdapter = new HeaderCellStyleAdapter();

        return defaultHeaderStyleAdapter;
    }
}
