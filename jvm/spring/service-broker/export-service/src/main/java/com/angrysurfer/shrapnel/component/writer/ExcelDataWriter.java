package com.angrysurfer.shrapnel.component.writer;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;

import com.angrysurfer.shrapnel.field.IField;
import com.angrysurfer.shrapnel.field.IValueFormatter;
import com.angrysurfer.shrapnel.filter.DataFilters;
import com.angrysurfer.shrapnel.filter.IDataFilters;
import com.angrysurfer.shrapnel.writer.IDataWriter;
import com.angrysurfer.shrapnel.exception.ShrapnelException;
import com.angrysurfer.shrapnel.component.writer.style.provider.CombinedStyleProvider;
import com.angrysurfer.shrapnel.component.writer.style.provider.IExcelStyleProvider;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Getter
@Setter
public class ExcelDataWriter extends DataWriter implements IDataWriter {

    public static final String WORKBOOK = "workbook";

    public static final String SHEET = "sheet";

    private Workbook workbook;

    private Sheet sheet;

    private int[] row = {0};

    private IDataFilters filters = new DataFilters();

    private CombinedStyleProvider styleProvider;

    private boolean autoCreateTopLevelHeader = true;

    public ExcelDataWriter(List< IField > fields) {
        super(fields);
    }

    public ExcelDataWriter(List<IField> fields, IValueFormatter valueRenderer) {
        super(fields, valueRenderer);
    }

    public ExcelDataWriter(List<IField> fields, IValueFormatter valueRenderer, CombinedStyleProvider styleProvider) {
        super(fields, valueRenderer);
        setStyleProvider(styleProvider);
    }

    protected void beforeRow(Object item) {
    }

    protected Cell createHeaderCell(IField field, Row header, int index) {
        Cell cell = header.createCell(index);
        cell.setCellStyle(getStyleProvider().getHeaderStyle(getWorkbook(), field));
        return cell;
    }

    protected int getCurrentRow() {
        return row[0];
    }

    protected Sheet getSheet(Map<String, Object> outputConfig) {
        return (Sheet) outputConfig.get(SHEET);
    }

    protected Workbook getWorkbook(Map<String, Object> outputConfig) {
        return (Workbook) outputConfig.get(WORKBOOK);
    }

    protected void incrementRow() {
        row[0]++;
    }

    public void onSheetSet(Sheet sheet) {

    }

    public void onWorkbookSet(Workbook workbook) {

    }

    public IExcelStyleProvider getStyleProvider() {
        if (Objects.isNull(styleProvider))
            styleProvider = new CombinedStyleProvider();

        return styleProvider;
    }

    protected void setup(Map<String, Object> outputConfig, Collection<Object> items) {
        if (!outputConfig.containsKey(WORKBOOK) || !outputConfig.containsKey(SHEET)
                || !(outputConfig.get(WORKBOOK) instanceof Workbook || !(outputConfig.get(SHEET) instanceof Sheet))
                || Objects.isNull(items))
            throw new IllegalArgumentException();

        setWorkbook((Workbook) outputConfig.get(WORKBOOK));
        setSheet((Sheet) outputConfig.get(SHEET));
    }

    public void setSheet(Sheet sheet) {
        this.sheet = sheet;
        onSheetSet(sheet);
        getStyleProvider().onSheetSet(sheet);
    }

    public void setWorkbook(Workbook workbook) {
        this.workbook = workbook;
        onWorkbookSet(workbook);
        getStyleProvider().onWorkbookSet(workbook);
    }

    protected void writeCell(IField field, Object item, Cell cell) {
        if (accessorExists(item, field.getPropertyName()) || field.getCalculated())
            cell.setCellValue(getValue(item, field));
    }

    @Override
    public void writeData(Map<String, Object> outputConfig, Collection<Object> items) {
        setup(outputConfig, items);
        writeDisclaimer();

        if (autoCreateTopLevelHeader)
            writerHeaderRow();

        try {
            items.stream().filter(item -> getFilters().allow(item, this, getPropertyAccessor()))
                    .forEach(item -> {
                        beforeRow(item);
                        writeDataRow(item, getSheet().createRow(getCurrentRow()));
                    });
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            if (DEBUG)
                writeError(e);
            throw new ShrapnelException(e.getMessage(), e);
        }
    }

    @Override
    public void writeError(Exception e) {
        Row r = getSheet().createRow(getCurrentRow());
        Cell errorCell1 = r.createCell(0);
        errorCell1.setCellValue(e.getClass().getName());
        errorCell1.setCellStyle(getStyleProvider().getCellStyle(getWorkbook()));

        Cell errorCell2 = r.createCell(1);
        errorCell2.setCellValue(e.getMessage());
        errorCell2.setCellStyle(getStyleProvider().getCellStyle(getWorkbook()));
    }

    protected void writeDataRow(Object item, Row row) {
        final int[] colNum = {getCellOffSet(item)};
        getFields().forEach(field -> {
            if (!shouldSkip(field, item) && shouldWrite(field, item)) {
                Cell cell = row.createCell(colNum[0]++);
                cell.setCellStyle(getStyleProvider().getCellStyle(item, getWorkbook(), field, getCurrentRow()));
                writeCell(field, item, cell);
            }
        });

        incrementRow();
    }

    protected void writeDisclaimer() {

        // incrementRow();
    }

    protected void writerHeaderRow() {
        final int[] index = {0};
        Row header = getSheet().createRow(getCurrentRow());
        getFields().forEach(field -> createHeaderCell(field, header, index[0]++).setCellValue(Objects.nonNull(field.getLabel()) ?
                field.getLabel() : field.getPropertyName().toUpperCase(Locale.ROOT)));

        incrementRow();
    }

}
