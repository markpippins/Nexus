package com.angrysurfer.shrapnel.field;

import lombok.Getter;
import lombok.Setter;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Getter
@Setter
public class Field implements IField {

	private String propertyName;

	private String label;

	private Integer index;

	private FieldTypeEnum type;

	private Boolean calculated = false;

	public Field(String propertyName, String label, FieldTypeEnum type) {
		setPropertyName(propertyName);
		setLabel(label);
		setType(type);
	}

	public static List< Field > createFieldSpecs(List< String > properties) {
		return properties.stream().map(property -> new Field(property, property.toUpperCase(Locale.ROOT), FieldTypeEnum.STRING))
				.collect(Collectors.toList());
	}

	public Field cloneWithNewLabel(String newLabel) {
		return new Field(getPropertyName(), newLabel, getType());
	}

	public static class DebugField extends Field {

		public DebugField(String propertyName, String headerLabel, FieldTypeEnum type) {
			super(propertyName, headerLabel, type);
		}

		@Override
		public String getLabel() {
			return "";
		}
	}
}
