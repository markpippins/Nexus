package com.angrysurfer.shrapnel.field;

import java.util.Arrays;
import java.util.stream.Collectors;

public enum FieldTypeEnum {

	BOOLEAN( 1 ),
	DATE( 2 ),
	DOUBLE( 3 ),
	CALENDAR( 4 ),
	LOCALDATE( 5 ),
	LOCALDATETIME( 6 ),
	RICHTEXT( 7 ),
	STRING( 8 );

	private int code;

	FieldTypeEnum( int code ) {

		this.code = code;
	}

	public static FieldTypeEnum from( String name ) throws IllegalArgumentException {

		FieldTypeEnum result = Arrays.asList( FieldTypeEnum.values( ) ).stream( ).filter( type -> type.name( ).equals( name ) ).findFirst( )
				.orElseThrow( ( ) -> new IllegalArgumentException(
						"\nUnknown name '" + name + "', Allowed names are "
								+ String.join( ", ", Arrays.asList( FieldTypeEnum.values( ) ).stream( ).map( ( FieldTypeEnum type ) -> {
							return String.join( name, "'", "'" );
						} ).collect( Collectors.toList( ) ) ) ) );

		return result;
	}

	public static FieldTypeEnum from( int code ) throws IllegalArgumentException {
		
		FieldTypeEnum result = Arrays.asList( FieldTypeEnum.values( ) ).stream( ).filter( type -> type.getCode( ) == code ).findFirst( )
				.orElseThrow( ( ) -> new IllegalArgumentException(
						"\nUnknown name '" + code + "', Allowed codes are "
								+ String.join( ", ", Arrays.asList( FieldTypeEnum.values( ) ).stream( ).map( ( FieldTypeEnum type ) -> {
							return String.join( Integer.toString( code ), "'", "'" );
						} ).collect( Collectors.toList( ) ) ) ) );

		return result;
	}

	public int getCode( ) {
		return code;
	}
}
