package com.angrysurfer.shrapnel.component.writer;

import java.util.ArrayList;
import java.util.List;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.field.IValueFormatter;
import com.itextpdf.layout.element.Cell;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Setter
public abstract class MultiLevelPdfDataWriter extends PdfDataWriter implements IMultiLevelDataWriter {

    protected int level = -1;

    private String levelPropertyName;

    public MultiLevelPdfDataWriter(String levelPropertyName, List< IField > fields, IValueFormatter valueRenderer) {
        super(fields, valueRenderer);
        setAutoCreateTopLevelHeader(false);
        setLevelPropertyName(levelPropertyName);
    }

    @Override
    protected void beforeRow(Object item) {
        beforeRow(this, item, getPropertyAccessor());
    }

    @Override
    public int getCellOffSet(Object item) {
        return getCellOffset(this, item, getPropertyAccessor());
    }

    @Override
    public boolean shouldSkip(IField field, Object item) {
        return super.shouldSkip(field, item) || shouldSkip(this, field, item, getPropertyAccessor());
    }

    @Override
    public boolean shouldWrite(IField field, Object item) {
        return super.shouldWrite(field, item) && shouldWrite(this, field, item, getPropertyAccessor());
    }

    @Override
    public void writeHeader() {
        List<Cell> row = new ArrayList<>();
        leftPadHeaderRow(getLevel() - 1, row);
        getFieldsForLevel(getLevel()).forEach(field -> row.add(createHeaderCell(field)));
        rightPadHeaderRow(row);
        row.forEach(getTable()::addCell);
    }

    protected void leftPadHeaderRow(int startCol, List<Cell> row) {
        while (row.size() < startCol)
            row.add(createHeaderCell(HEADER_PADDING_LEFT));
    }

    protected void rightPadHeaderRow(List<Cell> row) {
        while (row.size() < getFieldCount())
            row.add(createHeaderCell(HEADER_PADDING_LEFT));
    }
}
