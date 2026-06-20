package com.angrysurfer.shrapnel.component.writer.style.provider;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.component.writer.style.adapter.StyleAdapter;

public interface IStyleProvider {

    StyleAdapter getCellStyle(Object item, IField field, int row);

    default StyleAdapter getCellStyle() {
        return getCellStyle(null, null, 0);
    }

    default StyleAdapter getCellStyle(IField field) {
        return getCellStyle(null, field, 0);
    }

    StyleAdapter getHeaderStyle(IField field);

    default StyleAdapter getHeaderStyle() {
        return getHeaderStyle(null);
    }
}
