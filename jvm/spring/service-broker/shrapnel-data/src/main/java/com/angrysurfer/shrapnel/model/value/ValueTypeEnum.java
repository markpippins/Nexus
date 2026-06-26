package com.angrysurfer.shrapnel.model.value;

import java.util.Arrays;
import java.util.stream.Collectors;

public enum ValueTypeEnum {

	STRING(1, "value_string"),
	INTEGER(2, "value_integer"),
	LONG(3, "value_long"),
	DOUBLE(4, "value_double"),
	FLOAT(5, "value_float");

	private int code;

	private String tableName;

	ValueTypeEnum(int code, String tableName) {
		this.code      = code;
		this.tableName = tableName;
	}

	public static ValueTypeEnum from(String name) throws IllegalArgumentException {

		ValueTypeEnum result = Arrays.asList(ValueTypeEnum.values()).stream().filter(type -> type.name().equals(name)).findFirst()
				.orElseThrow(() -> new IllegalArgumentException(
						"\nUnknown name '" + name + "', Allowed names are "
								+ String.join(", ", Arrays.asList(ValueTypeEnum.values()).stream().map((ValueTypeEnum type) -> {
							return String.join(name, "'", "'");
						}).collect(Collectors.toList()))));

		return result;
	}

	public static ValueTypeEnum from(int code) throws IllegalArgumentException {

		ValueTypeEnum result = Arrays.asList(ValueTypeEnum.values()).stream().filter(type -> type.getCode() == code).findFirst()
				.orElseThrow(() -> new IllegalArgumentException(
						"\nUnknown name '" + code + "', Allowed codes are "
								+ String.join(", ", Arrays.asList(ValueTypeEnum.values()).stream().map((ValueTypeEnum type) -> {
							return String.join(Integer.toString(code), "'", "'");
						}).collect(Collectors.toList()))));

		return result;
	}

	public int getCode() {
		return code;
	}
}
