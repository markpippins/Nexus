package com.angrysurfer.shrapnel.component.writer.style;

import java.io.File;
import java.io.IOException;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.angrysurfer.shrapnel.PropertyConfig;
import com.angrysurfer.shrapnel.exception.ExportConfigurationException;
import com.itextpdf.io.font.FontProgram;
import com.itextpdf.io.font.FontProgramFactory;
import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class FontSource {

	private static final String FONT_NAME = "font.name";

	static String DEFAULT_FONT = "comic.ttf";

	static String ACTIVE_FONT = "active";

	static boolean deleteOnError = PropertyConfig.getInstance().containsKey(PropertyConfig.DELETE_ON_ERROR) ?
			                               Boolean.parseBoolean(PropertyConfig.getInstance().getProperty(PropertyConfig.DELETE_ON_ERROR).toString()) : false;

	public static boolean fontFileExists(String fontName) throws IOException {

		File file = new File(PropertyConfig.getInstance().getProperty(PropertyConfig.FONTS_FOLDER).toString());
		if ((Stream.of(file.listFiles()).filter(f -> f.getName().endsWith(".ttf")).collect(Collectors.toList()).size() > 0) ||
				    (Stream.of(file.listFiles()).filter(f -> f.getName().endsWith(".TTF")).collect(Collectors.toList()).size() > 0))
			return true;

		return false;
	}

	public static PdfFont getPdfFont(String fontName) throws IOException {

		File file = new File(PropertyConfig.getInstance().getProperty(PropertyConfig.FONTS_FOLDER).toString());
		if (Stream.of(file.listFiles()).filter(f -> f.getName().endsWith(".ttf")).collect(Collectors.toList()).size() > 0)
			return getPdfFont2(fontName + ".ttf");

		else if (Stream.of(file.listFiles()).filter(f -> f.getName().endsWith(".TTF")).collect(Collectors.toList()).size() > 0)
			return getPdfFont2(fontName + ".TTF");

		return null;
	}

	public static PdfFont getPdfFont2(String fontName) throws IOException {
		String      fontFileName = PropertyConfig.getInstance().getProperty(PropertyConfig.FONTS_FOLDER) + fontName;
		FontProgram fontProgram  = FontProgramFactory.createFont(fontFileName);
		try {
			return PdfFontFactory.createFont(fontProgram, PdfEncodings.WINANSI, PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED);
		}
		catch (Exception e) {
			log.error(e.getMessage(), e);

			if (deleteOnError) {
				log.info("marking {} for deletion.", fontFileName);
				File f = new File(fontFileName);
				if (f.exists() && f.isFile())
					f.delete();
			}

			throw e;
		}
	}

	public static PdfFont getFont() {
		try {
			PropertyConfig propertyConfig = PropertyConfig.getInstance();
			return PdfFontFactory.createFont(
					FontProgramFactory.createFont(propertyConfig.getProperty(PropertyConfig.FONTS_FOLDER).toString()
							.concat(propertyConfig.containsKey(FONT_NAME) ?
									        propertyConfig.getProperty(FONT_NAME).toString() : DEFAULT_FONT)),
					PdfEncodings.WINANSI, PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED);
		}
		catch (Exception e) {
			log.error(e.getMessage(), e);
			try {
				return PdfFontFactory.createFont(StandardFonts.COURIER);
			}
			catch (Exception e2) {
				throw new ExportConfigurationException(e2.getMessage(), e);
			}
		}
	}
}
