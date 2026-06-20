package com.angrysurfer.shrapnel.util;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

import com.angrysurfer.shrapnel.IExport;
import com.angrysurfer.shrapnel.component.writer.PdfDataWriter;
import com.angrysurfer.shrapnel.exception.ShrapnelException;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfVersion;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.WriterProperties;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Table;

public class PdfUtil {

	        public static Document createDocument(String filename, PageSize pageSize) throws FileNotFoundException {
        return new Document(new PdfDocument(new PdfWriter(filename, new WriterProperties().setPdfVersion(PdfVersion.PDF_2_0))), pageSize);
    }

    public static Document createDocument(String filename) throws FileNotFoundException {
        return new Document(new PdfDocument(new PdfWriter(filename, new WriterProperties().setPdfVersion(PdfVersion.PDF_2_0))), PageSize.A4);
	}

	    public static Document createDocument(ByteArrayOutputStream baos) {
        return new Document(new PdfDocument(new PdfWriter(baos, new WriterProperties().setPdfVersion(PdfVersion.PDF_2_0))), PageSize.A4);
	}

	    public static ByteArrayOutputStream generateByteArrayOutputStream(Collection<Object> items, PdfDataWriter pdfRowWriter) {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Document document = createDocument(baos);
        writeToTable(items, pdfRowWriter);
        document.add(pdfRowWriter.getTable());
        document.close();
        return baos;
    }

	    public static String writeTabularFile(Collection items, PdfDataWriter pdfRowWriter, String filename) {
        String outputFileName = FileUtil.getOutputFileName(filename, "pdf");
        FileUtil.ensureSafety(outputFileName);
        try {
            Document document = createDocument(outputFileName);
            writeToTable(items, pdfRowWriter);
            document.add(pdfRowWriter.getTable());
            document.close();
        } catch (IOException e) {
            throw new ShrapnelException(e.getMessage(), e);
        }
        return outputFileName;
    }

	public static String writeTabularFile(Collection items, PdfDataWriter pdfRowWriter, String filename, PageSize pageSize) {
		String outputFileName = FileUtil.getOutputFileName(filename, "pdf");
		FileUtil.ensureSafety(outputFileName);
		        try {
		            Document document = createDocument(outputFileName, pageSize);
		            writeToTable(items, pdfRowWriter);
		            document.add(pdfRowWriter.getTable());
		            document.close();
		        } catch (FileNotFoundException e) {
		            throw new ShrapnelException(e.getMessage(), e);
		        }		return outputFileName;
	}

	public static String writeTabularFile(Collection< Object > items, IExport export, String filename) {
		return writeTabularFile(items, export.getPdfRowWriter(), filename, export.getPdfPageSize());
	}

	public static void writeToTable(Collection< Object > items, PdfDataWriter pdfRowWriter, Table table) {
		Map< String, Object > outputConfig = new HashMap<>();
		outputConfig.put(PdfDataWriter.TABLE, table);
		pdfRowWriter.writeData(outputConfig, items);
	}

	public static void writeToTable(Collection< Object > items, PdfDataWriter pdfRowWriter) {
		Table table = pdfRowWriter.createTable();
		Map< String, Object > outputConfig = new HashMap<>();
		outputConfig.put(PdfDataWriter.TABLE, table);
		pdfRowWriter.writeData(outputConfig, items);
	}
}
