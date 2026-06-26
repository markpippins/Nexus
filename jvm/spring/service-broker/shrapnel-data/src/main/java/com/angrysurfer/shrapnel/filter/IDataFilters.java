package com.angrysurfer.shrapnel.filter;

import com.angrysurfer.shrapnel.property.IPropertyAccessor;
import com.angrysurfer.shrapnel.writer.IDataWriter;

import java.util.List;

public interface IDataFilters extends List< IDataFilter > {

	default boolean allow(Object item, IDataWriter writer, IPropertyAccessor propertyAccessor) {
		final boolean[] result = { true };

		forEach(filter -> {
			if (result[ 0 ])
				try {
					if (result[ 0 ] && !filter.allows(item, writer, propertyAccessor))
						result[ 0 ] = false;
				}
				catch (Exception e) {
						writer.writeError(e);
				}
		});

		return result[ 0 ];
	}

}
